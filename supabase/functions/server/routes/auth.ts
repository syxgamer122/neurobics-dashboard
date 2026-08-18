import type { Hono } from "npm:hono@4.12.27";
import {
  adminClient,
  PROFILE_COLS,
  SIGNUP_LIMIT,
  SIGNUP_WINDOW_SECONDS,
} from "../config.ts";
import {
  clientIp,
  consumeRateLimit,
  sha256,
  turnstileMessage,
  verifyTurnstile,
} from "../security.ts";
import { logServerEvent } from "../_shared/observability.ts";

export function registerAuthRoutes(app: Hono): void {

  // finalize guest upgrade
  app.post("/server/finalize-upgrade", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { targetEmail } = await c.req.json();
      
      const { error } = await adminClient.rpc("finalize_guest_upgrade_tx", {
        p_user_id: user.id,
        p_target_email: targetEmail
      });
      
      if (error) {
        logServerEvent({
          event: "auth.upgrade.finalize_error",
          level: "error",
          userId: user.id,
          message: error.message
        });
        return c.json({ error: error.message }, 400);
      }
      
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // ─── Sign up (username + password via email-spoofing) ────────────────────────
  // Creating a confirmed auth user needs the service role, so this stays on the
  // server. The on_auth_user_created trigger auto-inserts the public.profiles row.
  app.post("/server/signup", async (c) => {
    try {
      // P0-2: Thêm global counter signup_total per phút với ngưỡng cứng
      const globalAllowed = await consumeRateLimit("global_signup_budget", 300, 60);
      if (!globalAllowed) {
        return c.json({ error: "Too many signups globally. Please try again later." }, 429);
      }

      const ip = clientIp(c);
      const ipHash = await sha256(`mindgem-signup:${ip}`);
      // Kiem tra va tieu thu rate limit ngay de chong TOCTOU (flood)
      const allowed = await consumeRateLimit(
        ipHash,
        SIGNUP_LIMIT,
        SIGNUP_WINDOW_SECONDS,
      );

      if (allowed !== true) {
        return c.json(
          {
            error:
              "Too many signup attempts. Please wait 15 minutes and try again.",
          },
          429,
        );
      }

      const { username, password, captchaToken, isGuest, isAdult } = await c.req.json();
      
      if (!isAdult) {
        return c.json({ error: "You must be 13 years or older to use this service." }, 403);
      }
      
      if (!username && !isGuest) {
        return c.json(
          {
            error:
              "Signup error: username is required.",
          },
          400,
        );
      }
      if (!captchaToken) {
        return c.json(
          {
            error:
              "Signup error: human verification is required.",
          },
          400,
        );
      }

      const verdict = await verifyTurnstile(String(captchaToken), ip);
      if (!verdict.ok) {
        return c.json(
          {
            error: turnstileMessage(verdict.codes),
            code: verdict.codes.join(", ") || "unknown",
          },
          400,
        );
      }
      
      // Guest Quota: Limit to 5 guests per IP per 24 hours to prevent abuse
      if (isGuest) {
        const guestIpHash = await sha256(`mindgem-guest-quota:${ip}`);
        const guestAllowed = await consumeRateLimit(guestIpHash, 5, 86400);
        if (!guestAllowed) {
          return c.json(
            { error: "Guest account quota exceeded for this network. Please sign up for a free full account to continue." },
            429
          );
        }
      }

      // Dem thanh cong thuc su cho rate limit thu 2 (thay vi dung record_signup_attempt som)

      const normalized = isGuest 
        ? `guest-${crypto.randomUUID().split('-')[0]}`
        : String(username).trim().toLowerCase();
      
      const pw = isGuest ? crypto.randomUUID() : String(password);

      // Chi cho phep a-z 0-9 _ . - (3-20) — tranh email gia khong hop le.
      if (!isGuest && !/^[a-z0-9_.-]{3,20}$/.test(normalized)) {
        return c.json(
          {
            error:
              "Signup error: username must be 3–20 characters (letters, numbers, _ . -).",
          },
          400,
        );
      }
      if (!isGuest && pw.length < 8) {
        return c.json(
          { error: "Signup error: password must be at least 8 characters." },
          400,
        );
      }

      // Thong diep chung — khong tiet lo ten da ton tai / bi giu cho.
      const NAME_TAKEN =
        "Signup error: that username is not available. Try another.";

      const { data: reserved } = await adminClient
        .from("reserved_usernames")
        .select("username")
        .eq("username", normalized)
        .maybeSingle();
      if (reserved) {
        return c.json({ error: NAME_TAKEN }, 409);
      }

      const { data: existing, error: lookupErr } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", normalized)
        .maybeSingle();
      if (lookupErr) {
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `Signup error during username lookup for "${username}": ${lookupErr.message}`,
        });
        return c.json({ error: "Signup is temporarily unavailable." }, 500);
      }
      if (existing) {
        return c.json({ error: NAME_TAKEN }, 409);
      }

      // Email-spoofing trick so users only need a username.
      const email = `${normalized}@mindgem.local`;

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        user_metadata: { username },
        // Automatically confirm the user's email since an email server hasn't been configured.
        email_confirm: true,
      });

      if (error || !data?.user) {
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `Signup error while creating auth user for "${username}": ${error?.message}`,
        });
        const duplicate = /already|registered|exists|duplicate|unique/i.test(
          error?.message ?? "",
        );
        return c.json(
          { error: duplicate ? NAME_TAKEN : "Signup could not be completed." },
          duplicate ? 409 : 400,
        );
      }

      // Update role to guest if applicable. This ensures profiles gets the correct role.
      let recoveryCode: string | undefined = undefined;
      if (isGuest && data.user) {
        await adminClient.from("profiles").update({ role: "guest" }).eq("id", data.user.id);
        
        // Generate 12-char alphanumeric recovery code
        recoveryCode = Array.from({ length: 12 }, () => 
          "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(Math.floor(Math.random() * 36))
        ).join("");
        const codeHash = await sha256(recoveryCode);
        await adminClient.from("account_recovery").insert({
          user_id: data.user.id,
          code_hash: codeHash
        });
      }
      // transaction — read it back to return to the client.
      const { data: profile, error: profileErr } = await adminClient
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", data.user.id)
        .single();

      if (profileErr || !profile) {
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `Signup error: profile row not found after user creation: ${profileErr?.message}`,
        });
        // Neu trigger profile fail, xoa auth user vua tao de khong tao tai khoan mo coi.
        await adminClient.auth.admin.deleteUser(data.user.id);
        return c.json({ error: "Signup could not be completed." }, 500);
      }

      if (isGuest) {
        return c.json({ profile, _guestName: normalized, _guestPw: pw, recoveryCode });
      }
      return c.json({ profile });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Signup error (unexpected) in /signup route: ${err}`,
      });
      return c.json({ error: "Signup is temporarily unavailable." }, 500);
    }
  });

  // ─── Recover Guest Account ────────────────────────────────────────────────
  app.post("/server/recover", async (c) => {
    try {
      const { recoveryCode } = await c.req.json();
      if (!recoveryCode || typeof recoveryCode !== "string") {
        return c.json({ error: "Invalid recovery code" }, 400);
      }

      const codeHash = await sha256(recoveryCode);
      const { data: recovery, error: lookupErr } = await adminClient
        .from("account_recovery")
        .select("user_id")
        .eq("code_hash", codeHash)
        .maybeSingle();

      if (lookupErr || !recovery) {
        return c.json({ error: "Invalid or expired recovery code" }, 404);
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("username, role")
        .eq("id", recovery.user_id)
        .single();

      if (!profile || profile.role !== "guest") {
        return c.json({ error: "Recovery is only for guest accounts" }, 400);
      }

      const newPw = crypto.randomUUID();
      const email = `${profile.username}@mindgem.local`;

      // Update auth user's password
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(recovery.user_id, {
        password: newPw
      });

      if (updateErr) {
        throw updateErr;
      }

      logServerEvent({
        event: "auth.guest_recovered",
        level: "info",
        userId: recovery.user_id,
        message: "Guest account recovered using code",
        requestId: requestIdFor(c.req.raw),
        persist: true
      });

      return c.json({
        _guestName: profile.username,
        _guestPw: newPw
      });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Recovery error: ${err}`,
      });
      return c.json({ error: "Recovery failed" }, 500);
    }
  });

  // ─── Upgrade Guest (P1-12, P1-13) ───────────────────────────────────────────
  app.post("/server/upgrade-account", async (c) => {
    try {
      const authHeader = c.req.header("Authorization");
      if (!authHeader?.startsWith("Bearer "))
        return c.json({ error: "Missing authorization" }, 401);
      
      const token = authHeader.slice(7);
      const { data: userAuth, error: authErr } = await adminClient.auth.getUser(token);
      if (authErr || !userAuth?.user) 
        return c.json({ error: "Invalid session" }, 401);
      
      const user = userAuth.user;
      
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role, username")
        .eq("id", user.id)
        .single();
        
      if (profile?.role !== "guest") {
        return c.json({ error: "Account is not a guest" }, 400);
      }

      const { newUsername, newPassword, newEmail, isAdult } = await c.req.json();
      
      if (!isAdult) {
        return c.json({ error: "You must be 13 years or older to use this service." }, 403);
      }
      
      if (!/^[a-z0-9_.-]{3,20}$/.test(newUsername?.trim().toLowerCase() || "")) {
        return c.json({ error: "Invalid new username" }, 400);
      }
      
      if (!newPassword || newPassword.length < 8) {
        return c.json({ error: "Password must be at least 8 characters" }, 400);
      }

      const normalized = newUsername.trim().toLowerCase();
      const targetEmail = newEmail ? newEmail.trim() : `${normalized}@mindgem.local`;
      const isSpoofed = targetEmail.endsWith("@mindgem.local");
      
      // Check availability
      const { data: existing } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", normalized)
        .maybeSingle();
        
      if (existing) {
        return c.json({ error: "Username is not available" }, 409);
      }

      // Create upgrade operation (State Machine)
      const { error: opErr } = await adminClient.from("upgrade_operations").insert({
        user_id: user.id,
        target_email: targetEmail,
        target_username: normalized,
        status: "pending_verification"
      });

      if (opErr) {
        if (opErr.code === '23505') return c.json({ error: "An upgrade is already in progress for this account." }, 409);
        throw opErr;
      }

      // Update auth.users (email + password).
      // If spoofed, we auto-confirm. Otherwise, Supabase sends a verification email.
      const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(user.id, {
        email: targetEmail,
        password: newPassword,
        user_metadata: { username: normalized },
        email_confirm: isSpoofed,
      });
      
      if (updateAuthErr) {
        await adminClient.from("upgrade_operations").delete().eq("user_id", user.id);
        throw updateAuthErr;
      }

      // Delete old recovery codes
      await adminClient.from("account_recovery").delete().eq("user_id", user.id);

      // Sign out all old sessions globally
      await adminClient.auth.admin.signOut(user.id, "global");

      logServerEvent({
        event: "auth.guest_upgraded",
        level: "info",
        userId: user.id,
        message: `Guest account upgrade initiated to ${isSpoofed ? 'spoofed' : 'real'} email`,
        requestId: requestIdFor(c.req.raw),
        persist: true
      });

      return c.json({ 
        success: true, 
        username: normalized, 
        requiresLogin: true,
        pendingVerification: !isSpoofed
      });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Guest upgrade error: ${err}`,
      });
      return c.json({ error: "Could not upgrade guest account" }, 500);
    }
  });
}
