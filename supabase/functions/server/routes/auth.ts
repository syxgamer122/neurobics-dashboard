import type { Hono } from "npm:hono@4.12.27";
import {
  adminClient,
  PROFILE_COLS,
  RECOVERY_LIMIT,
  RECOVERY_WINDOW_SECONDS,
  SIGNUP_LIMIT,
  SIGNUP_WINDOW_SECONDS,
} from "../config.ts";
import {
  clientIp,
  consumeRateLimit,
  mintRecoveryCode,
  recoveryHmac,
  sha256,
  turnstileMessage,
  verifyTurnstile,
} from "../security.ts";

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
        console.log(
          `Signup error during username lookup for "${username}": ${lookupErr.message}`,
        );
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
        console.log(
          `Signup error while creating auth user for "${username}": ${error?.message}`,
        );
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
        console.log(
          `Signup error: profile row not found after user creation: ${profileErr?.message}`,
        );
        // Neu trigger profile fail, xoa auth user vua tao de khong tao tai khoan mo coi.
        await adminClient.auth.admin.deleteUser(data.user.id);
        return c.json({ error: "Signup could not be completed." }, 500);
      }

      // Ma khoi phuc: chi tra 1 lan. Hash nam bang account_recovery (service_role).
      const recoveryCode = mintRecoveryCode();
      const recoveryHash = await recoveryHmac(normalized, recoveryCode);
      const { error: recErr } = await adminClient
        .from("account_recovery")
        .upsert({
          user_id: data.user.id,
          code_hash: recoveryHash,
          created_at: new Date().toISOString(),
        });
      if (recErr)
        console.log(`Recovery code persist failed: ${recErr.message}`);

      return c.json({ profile, recoveryCode });
    } catch (err) {
      console.log(`Signup error (unexpected) in /signup route: ${err}`);
      return c.json({ error: "Signup is temporarily unavailable." }, 500);
    }
  });
  // ─── Password recovery (no real email) ─────────────────────────────────────
  // Tài khoản dùng email giả @mindgem.local (hoặc legacy @neurobics.local)
  // nên không reset qua hộp thư được.
  // Người dùng phải giữ mã khôi phục cấp lúc đăng ký.
  app.post("/server/recover-password", async (c) => {
    try {
      const ip = clientIp(c);
      const { username, recoveryCode, newPassword, captchaToken } =
        await c.req.json();

      if (!username || !recoveryCode || !newPassword || !captchaToken) {
        return c.json({ error: "Missing fields." }, 400);
      }
      const normalized = String(username).trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,20}$/.test(normalized)) {
        return c.json({ error: "Invalid recovery code or username." }, 400);
      }

      // Hai khoa doc lap: chan spam tu mot IP va brute-force mot username qua
      // nhieu IP. Chi luu hash, khong luu IP/username tho.
      const [ipAllowed, userAllowed] = await Promise.all([
        consumeRateLimit(
          await sha256(`mindgem-recovery-ip:${ip}`),
          RECOVERY_LIMIT,
          RECOVERY_WINDOW_SECONDS,
        ),
        consumeRateLimit(
          await sha256(`mindgem-recovery-user:${normalized}`),
          RECOVERY_LIMIT,
          RECOVERY_WINDOW_SECONDS,
        ),
      ]);
      if (!ipAllowed || !userAllowed) {
        return c.json(
          { error: "Too many recovery attempts. Try again in one hour." },
          429,
        );
      }

      if (String(newPassword).length < 8) {
        return c.json(
          { error: "Password must be at least 8 characters." },
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

      const { data: prof, error: pErr } = await adminClient
        .from("profiles")
        .select("id, username")
        .eq("username", normalized)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!prof) {
        return c.json(
          { error: "Invalid recovery code or username.", code: "bad_recovery" },
          400,
        );
      }

      const { data: rec, error: rErr } = await adminClient
        .from("account_recovery")
        .select("code_hash")
        .eq("user_id", prof.id)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!rec?.code_hash) {
        return c.json(
          { error: "Invalid recovery code or username.", code: "bad_recovery" },
          400,
        );
      }

      const eq = (a: string, b: string) => {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) {
          diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return diff === 0;
      };

      const codeUpper = String(recoveryCode).trim().toUpperCase();
      const codeRaw = String(recoveryCode).trim();
      const candidate = await recoveryHmac(normalized, codeUpper);
      const candidateRaw = await recoveryHmac(normalized, codeRaw);
      // Tuong thich ma cu da cap truoc 20260820 (SHA-256 co prefix).
      // Brand cu: neurobics-recovery — brand moi: mindgem-recovery.
      const legacyMindgem = await sha256(
        `mindgem-recovery:${normalized}:${codeUpper}`,
      );
      const legacyMindgemRaw = await sha256(
        `mindgem-recovery:${normalized}:${codeRaw}`,
      );
      const legacyNeuro = await sha256(
        `neurobics-recovery:${normalized}:${codeUpper}`,
      );
      const legacyNeuroRaw = await sha256(
        `neurobics-recovery:${normalized}:${codeRaw}`,
      );
      if (
        !eq(candidate, rec.code_hash) &&
        !eq(candidateRaw, rec.code_hash) &&
        !eq(legacyMindgem, rec.code_hash) &&
        !eq(legacyMindgemRaw, rec.code_hash) &&
        !eq(legacyNeuro, rec.code_hash) &&
        !eq(legacyNeuroRaw, rec.code_hash)
      ) {
        return c.json(
          { error: "Invalid recovery code or username.", code: "bad_recovery" },
          400,
        );
      }

      const { error: upErr } = await adminClient.auth.admin.updateUserById(prof.id, {
        password: String(newPassword),
      });
      if (upErr) throw upErr;

      // Da moi phien dang mo hien tai
      await adminClient.auth.admin.signOut(prof.id, "global");

      // Xoay ma moi, tra ve dung 1 lan de user giu
      const nextCode = mintRecoveryCode();
      const nextHash = await recoveryHmac(normalized, nextCode);
      
      await adminClient.from("account_recovery").upsert({
        user_id: prof.id,
        code_hash: nextHash,
        created_at: new Date().toISOString(),
      });

      return c.json({ ok: true, recoveryCode: nextCode });
    } catch (err) {
      console.log(`Recover password error: ${err}`);
      return c.json(
        { error: "Password recovery is temporarily unavailable." },
        500,
      );
    }
  });
}
