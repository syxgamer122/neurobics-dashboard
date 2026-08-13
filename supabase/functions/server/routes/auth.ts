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
  // ─── Sign up (username + password via email-spoofing) ────────────────────────
  // Creating a confirmed auth user needs the service role, so this stays on the
  // server. The on_auth_user_created trigger auto-inserts the public.profiles row.
  app.post("/server/signup", async (c) => {
    try {
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

      const { username, password, captchaToken } = await c.req.json();
      if (!username || !password || !captchaToken) {
        return c.json(
          {
            error:
              "Signup error: username, password and human verification are required.",
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

      // Dem thanh cong thuc su cho rate limit thu 2 (thay vi dung record_signup_attempt som)

      const normalized = String(username).trim().toLowerCase();
      const pw = String(password);

      // Chi cho phep a-z 0-9 _ . - (3-20) — tranh email gia khong hop le.
      if (!/^[a-z0-9_.-]{3,20}$/.test(normalized)) {
        return c.json(
          {
            error:
              "Signup error: username must be 3–20 characters (letters, numbers, _ . -).",
          },
          400,
        );
      }
      if (pw.length < 8) {
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

      // The trigger has already created the profile row within the same
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
}
