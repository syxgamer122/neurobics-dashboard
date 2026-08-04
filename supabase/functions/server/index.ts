import { Hono, type Context } from "npm:hono@4.12.27";
import { cors } from "npm:hono@4.12.27/cors";
import { logger } from "npm:hono@4.12.27/logger";
import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { GAME_IDS, isGame, scoreAndValidate } from "../_shared/round-scoring.ts";
import { inspectRound, hasHardFlag, softFlags } from "../_shared/anticheat.ts";

const app = new Hono();

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    // ALLOWED_ORIGINS la danh sach phan cach boi dau phay. Van giu default
    // production + localhost de deploy cu khong bi mat truy cap.
    origin: (
      Deno.env.get("ALLOWED_ORIGINS") ??
      "https://nguyenhuumanh.vercel.app,https://mindgem-dashboard-pfl3.vercel.app,http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Admin client (service role) — required to create a confirmed auth user.
const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SESSION_COLUMNS = GAME_IDS.map((game) => `${game}_sessions` as const);
const SESSION_SELECT = SESSION_COLUMNS.join(", ");
const EMPTY_SESSION_PATCH = Object.fromEntries(
  SESSION_COLUMNS.map((column) => [column, 0]),
);
const PROFILE_COLS =
  `id, username, avatar_url, role, birth_year, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, synapse_streak, total_xp, last_active_date, ${SESSION_SELECT}, created_at`;
// Ca nha thuong dung chung mot duong mang, nen mot dia chi phai du cho
// vai nguoi cung dang ky.
const SIGNUP_LIMIT = 10;
const SIGNUP_WINDOW_SECONDS = 15 * 60;
const RECOVERY_LIMIT = 10;
const RECOVERY_WINDOW_SECONDS = 60 * 60;
const MAX_TICKET_STARTS_PER_MINUTE = 20;
// Tran XP tuyet doi cho moi duong ghi (admin grant lan thuong theo van).
// Level = floor((-1 + sqrt(1 + xp/12.5))/2)+1, nen 200 trieu XP ~ level 2000.
const XP_MAX = 200_000_000;

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC cho ma recovery moi. Ma cu SHA-256 van duoc verify de khong khoa user cu. */
async function recoveryHmac(username: string, code: string): Promise<string> {
  const secret = Deno.env.get("RECOVERY_HMAC_SECRET");
  if (!secret || secret.length < 32)
    throw new Error("RECOVERY_HMAC_SECRET is not configured securely.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${username}:${code}`),
    ),
  );
}

async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await adminClient.rpc("check_signup_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`Rate-limit unavailable: ${error.message}`);
  return data === true;
}

/** Mã khôi phục dạng XXXX-XXXX-XXXX (dễ chép tay), chỉ hiện 1 lần lúc đăng ký. */
function mintRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (let i = 0; i < 12; i++) raw += alphabet[bytes[i] % alphabet.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function clientIp(c: Context): string {
  // CHI tin x-forwarded-for: header nay do chinh ha tang Supabase/Deno gan vao.
  //
  // Truoc day `cf-connecting-ip` va `x-real-ip` duoc uu tien TRUOC. Edge
  // Function cua Supabase khong dung sau Cloudflare nen khong co gi ghi de hai
  // header do => client tu dat duoc. Ke tan cong chi can doi header moi request
  // la moi lan ra mot hash IP khac nhau, vo hieu hoan toan gioi han 10 lan/15
  // phut cua rate-limit dang ky.
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length > 0 ? forwarded : "unknown";
}

type TurnstileVerdict = { ok: boolean; codes: string[] };

async function verifyTurnstile(
  token: string,
  ip: string,
): Promise<TurnstileVerdict> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured.");

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
    },
  );
  if (!response.ok)
    throw new Error(`Turnstile Siteverify returned HTTP ${response.status}.`);

  const result = (await response.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };
  const codes = result["error-codes"] ?? [];
  if (!result.success)
    console.log(`Turnstile rejected signup: ${codes.join(", ") || "no code"}`);
  return { ok: result.success === true, codes };
}

// Doi ma loi kho hieu cua Cloudflare thanh cau nguoi thuong doc duoc.
function turnstileMessage(codes: string[]): string {
  if (
    codes.includes("missing-input-secret") ||
    codes.includes("invalid-input-secret")
  )
    return "Human verification is misconfigured on the server. Please contact the admin.";
  if (codes.includes("timeout-or-duplicate"))
    return "Human verification expired. Please tick the box again and resubmit.";
  if (
    codes.includes("invalid-input-response") ||
    codes.includes("missing-input-response")
  )
    return "Human verification token is invalid. Please tick the box again.";
  return "Human verification failed or expired. Please try again.";
}

app.get("/server/health", (c) => c.json({ status: "ok" }));

// ─── Sign up (username + password via email-spoofing) ────────────────────────
// Creating a confirmed auth user needs the service role, so this stays on the
// server. The on_auth_user_created trigger auto-inserts the public.profiles row.
app.post("/server/signup", async (c) => {
  try {
    const ip = clientIp(c);
    const ipHash = await sha256(`mindgem-signup:${ip}`);
    // Chi HOI xem con luot khong, khong tru luot o day. Viec tru duoc doi
    // den luc tai khoan that su duoc tao, o cuoi ham nay.
    const { data: allowed, error: rateError } = await adminClient.rpc(
      "check_signup_rate_limit",
      {
        p_key: ipHash,
        p_limit: SIGNUP_LIMIT,
        p_window_seconds: SIGNUP_WINDOW_SECONDS,
      },
    );

    if (rateError) {
      console.log(`Signup rate-limit error: ${rateError.message}`);
      return c.json(
        { error: "Signup is temporarily unavailable. Please try again later." },
        503,
      );
    }
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

    // Dem moi lan da qua captcha (ke ca fail) — chan do username vo han.
    const { error: recordEarlyErr } = await adminClient.rpc(
      "record_signup_attempt",
      { p_key: ipHash, p_window_seconds: SIGNUP_WINDOW_SECONDS },
    );
    if (recordEarlyErr)
      console.log(`Signup rate-limit record failed: ${recordEarlyErr.message}`);

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
    if (recErr) console.log(`Recovery code persist failed: ${recErr.message}`);

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
      return c.json({ error: "Password must be at least 8 characters." }, 400);
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
      candidate !== rec.code_hash &&
      candidateRaw !== rec.code_hash &&
      legacyMindgem !== rec.code_hash &&
      legacyMindgemRaw !== rec.code_hash &&
      legacyNeuro !== rec.code_hash &&
      legacyNeuroRaw !== rec.code_hash
    ) {
      return c.json(
        { error: "Invalid recovery code or username.", code: "bad_recovery" },
        400,
      );
    }

    const { error: upErr } = await adminClient.auth.admin.updateUserById(
      prof.id,
      { password: String(newPassword) },
    );
    if (upErr) throw upErr;

    await adminClient.from("account_recovery").delete().eq("user_id", prof.id);

    return c.json({ ok: true });
  } catch (err) {
    console.log(`Recover password error: ${err}`);
    return c.json(
      { error: "Password recovery is temporarily unavailable." },
      500,
    );
  }
});

// ─── Secure round lifecycle ──────────────────────────────────────────────────
async function authenticatedUser(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    throw new Error("Missing authorization");
  const token = authHeader.slice(7);
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user;
}

// Creates a one-time ticket. The browser cannot write round_tickets directly.
app.post("/server/start-round", async (c) => {
  try {
    const user = await authenticatedUser(c);
    const { game } = await c.req.json();
    const gameId = String(game);
    if (!isGame(gameId)) return c.json({ error: "Invalid game" }, 400);

    // Mot user chi co the choi mot van tai mot thoi diem. Dong ticket cu truoc
    // khi mint ticket moi, tranh ticket warm/refresh bi tich trong 3 gio roi
    // khoa nham nguoi choi bang 429.
    const { error: closeError } = await adminClient
      .from("round_tickets")
      .update({ submitted_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("submitted_at", null);
    if (closeError) throw closeError;

    // Van chan spam DB that su, nhung dem toc do tao trong 1 phut thay vi dem
    // ticket bo do trong 3 gio. Nguoi choi binh thuong khong the cham 20 lan/phut.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await adminClient
      .from("round_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", oneMinuteAgo);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_TICKET_STARTS_PER_MINUTE) {
      return c.json(
        { error: "Too many round starts. Wait one minute and try again." },
        429,
      );
    }

    const { data, error } = await adminClient
      .from("round_tickets")
      .insert({ user_id: user.id, game: gameId })
      .select("id, game, started_at, expires_at")
      .single();
    if (error) throw error;
    return c.json({
      roundId: data.id,
      game: data.game,
      startedAt: data.started_at,
      expiresAt: data.expires_at,
    });
  } catch (err) {
    console.log(`Start round error: ${err}`);
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      401,
    );
  }
});

// One finish request: validate telemetry, score on server, atomically save axes,
// session, streak and XP, then return the fresh profile for immediate rendering.
app.post("/server/submit-round", async (c) => {
  try {
    const user = await authenticatedUser(c);
    const body = await c.req.json();
    const { roundId, game, telemetry, fingerprint } = body ?? {};
    const gameId = String(game);
    if (!roundId || !isGame(gameId))
      return c.json({ error: "roundId and valid game are required" }, 400);

    const { data: ticket, error: ticketError } = await adminClient
      .from("round_tickets")
      .select("id, user_id, game, started_at, expires_at, submitted_at")
      .eq("id", String(roundId))
      .eq("user_id", user.id)
      .single();
    if (ticketError || !ticket)
      return c.json({ error: "Round ticket not found" }, 404);
    if (ticket.game !== gameId)
      return c.json({ error: "Round game mismatch" }, 400);
    if (ticket.submitted_at)
      return c.json({ error: "Round already submitted" }, 409);
    if (Date.parse(ticket.expires_at) < Date.now())
      return c.json({ error: "Round ticket expired" }, 410);

    const serverElapsedMs = Date.now() - Date.parse(ticket.started_at);

    // Lớp chống gian lận: hard flag từ chối ván, soft flag vẫn chấm nhưng ghi log.
    const cheat = inspectRound(gameId, telemetry, serverElapsedMs);
    if (hasHardFlag(cheat)) {
      // Dot ticket TRUOC khi tra 422 de khong bien anti-cheat thanh oracle thu lai.
      const { error: burnError } = await adminClient
        .from("round_tickets")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", ticket.id)
        .is("submitted_at", null);
      if (burnError) {
        console.log(`Hard-rejected ticket burn failed: ${burnError.message}`);
        return c.json({ error: "Round could not be finalized." }, 503);
      }

      const hard = cheat.flags.filter((f) => f.severity === "hard");
      for (const f of hard) {
        const { error: hardErr } = await adminClient.rpc("record_cheat_flag", {
          p_user_id: user.id,
          p_game: gameId,
          p_reason: f.msg,
          p_severity: "hard",
          p_details: f.detail ?? {},
        });
        if (hardErr) console.log(`Hard cheat flag failed: ${hardErr.message}`);
      }
      return c.json(
        {
          error: "Round rejected: suspicious timing patterns.",
          code: "anticheat_hard",
          flags: hard.map((f) => f.msg),
        },
        422,
      );
    }
    for (const f of softFlags(cheat)) {
      const { error: softErr } = await adminClient.rpc("record_cheat_flag", {
        p_user_id: user.id,
        p_game: gameId,
        p_reason: f.msg,
        p_severity: "soft",
        p_details: f.detail ?? {},
      });
      if (softErr) console.log(`Soft cheat flag failed: ${softErr.message}`);
    }

    // Ghi dấu vân thiết bị (không chặn ván nếu RPC lỗi).
    if (typeof fingerprint === "string" && fingerprint.length >= 8) {
      const { error: fpErr } = await adminClient.rpc("link_device", {
        p_user_id: user.id,
        p_fingerprint: fingerprint.slice(0, 200),
      });
      if (fpErr) console.log(`link_device failed: ${fpErr.message}`);
    }

    const scored = scoreAndValidate(gameId, telemetry, serverElapsedMs);
    const axisPayload = Object.fromEntries(
      Object.entries(scored.axes).filter(([, value]) => value !== null),
    );

    const { data, error } = await adminClient.rpc("submit_round_transaction", {
      p_user_id: user.id,
      p_ticket_id: String(roundId),
      p_game: gameId,
      p_axes: axisPayload,
      p_round_score: scored.headline,
      p_label: scored.label,
      p_time_ms: Math.round(scored.timeMs),
    });
    if (error) {
      throw new Error(error.message);
    }

    return c.json({
      ...data,
      axes: scored.axes,
      headline: scored.headline,
      label: scored.label,
      timeMs: scored.timeMs,
      cheatFlags: cheat.flags.map((f) => ({
        msg: f.msg,
        severity: f.severity,
      })),
    });
  } catch (err) {
    console.log(`Submit round error: ${err}`);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
    const lower = message.toLowerCase();
    let status = 400;
    if (
      lower.includes("authorization") ||
      lower.includes("session") ||
      lower.includes("expired") ||
      lower.includes("invalid or expired") ||
      lower.includes("missing authorization")
    )
      status = 401;
    else if (lower.includes("already submitted")) status = 409;
    return c.json({ error: message }, status);
  }
});

// Legacy endpoint deliberately disabled: accepting roundScore directly from the
// browser would bypass server-side telemetry scoring.
app.post("/server/award-xp", (c) =>
  c.json({ error: "Deprecated: use start-round + submit-round" }, 410),
);

async function requireAdmin(userId: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error || data?.role !== "admin") throw new Error("Admin access denied");
}

app.post("/server/admin-grant", async (c) => {
  try {
    const user = await authenticatedUser(c);
    await requireAdmin(user.id);
    const { targetId, axes = {}, xp, mode = "add" } = await c.req.json();
    if (!targetId || !["add", "set"].includes(mode))
      return c.json({ error: "Invalid admin grant" }, 400);
    const { data: target, error: readError } = await adminClient
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", targetId)
      .single();
    if (readError || !target) throw readError ?? new Error("Target not found");
    // Khop src/app/lib/axes.ts
    const columns: Record<string, string> = {
      logic: "algebraic_logic_score",
      memory: "memory_score",
      speed: "speed_score",
      focus: "focus_score",
      spatial: "cfop_spatial_record",
    };
    const patch: Record<string, number> = {};
    for (const [key, column] of Object.entries(columns)) {
      if (axes[key] === undefined || !Number.isFinite(Number(axes[key])))
        continue;
      const amount = Number(axes[key]),
        current = Number(target[column] ?? 0),
        next = mode === "set" ? amount : current + amount;
      patch[column] = Math.max(0, Math.min(1000, Math.round(next)));
    }
    if (xp !== undefined && Number.isFinite(Number(xp))) {
      const next =
        mode === "set" ? Number(xp) : Number(target.total_xp ?? 0) + Number(xp);
      // Chan tren bat buoc: mot lan go nham so 0 tung day total_xp len 1e14,
      // keo level nhay len 1.414.214 va lam hong ca bang xep hang. XP_MAX ung
      // voi level ~2000, du cho moi muc choi that ma van khong tran float8.
      patch.total_xp = Math.max(0, Math.min(XP_MAX, Math.round(next)));
    }
    if (!Object.keys(patch).length)
      return c.json({ error: "Nothing to update" }, 400);
    const { data, error } = await adminClient
      .from("profiles")
      .update(patch)
      .eq("id", targetId)
      .select(PROFILE_COLS)
      .single();
    if (error) throw error;
    // Cong XP bang quyen admin thi phai danh gia lai badge NGAY. Truoc day
    // badge chi duoc dong bo khi nguoi dung TU MO bang thanh tuu, nen tai
    // khoan duoc admin keo len level 7 van trong tron badge cho den luc do.
    // Loi dong bo KHONG duoc lam that bai ca lenh grant: XP da ghi xong roi,
    // va badge se tu dong bo lai o lan mo bang thanh tuu ke tiep.
    if (patch.total_xp !== undefined) {
      const { error: syncError } = await adminClient.rpc(
        "sync_achievements_for",
        { p_user: targetId },
      );
      if (syncError)
        console.log(`Admin grant badge sync failed: ${syncError.message}`);
    }
    return c.json({ profile: data });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      403,
    );
  }
});

app.post("/server/admin-reset", async (c) => {
  try {
    const user = await authenticatedUser(c);
    await requireAdmin(user.id);
    const { targetId } = await c.req.json();
    if (!targetId) return c.json({ error: "targetId required" }, 400);
    const patch = {
      algebraic_logic_score: 0,
      memory_score: 0,
      speed_score: 0,
      focus_score: 0,
      cfop_spatial_record: 0,
      synapse_streak: 0,
      ...EMPTY_SESSION_PATCH,
      total_xp: 0,
      last_active_date: null,
    };
    const { data, error } = await adminClient
      .from("profiles")
      .update(patch)
      .eq("id", targetId)
      .select(PROFILE_COLS)
      .single();
    if (error) throw error;
    return c.json({ profile: data });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      403,
    );
  }
});

// Admin xoa user tron (profile + auth + avatar).
app.post("/server/admin-delete-user", async (c) => {
  try {
    const user = await authenticatedUser(c);
    await requireAdmin(user.id);
    const { targetId } = await c.req.json();
    if (!targetId) return c.json({ error: "targetId required" }, 400);
    if (targetId === user.id)
      return c.json({ error: "Use delete-account for your own account" }, 400);

    try {
      const { data: listed } = await adminClient.storage
        .from("avatars")
        .list(targetId);
      if (listed && listed.length > 0) {
        await adminClient.storage
          .from("avatars")
          .remove(listed.map((f) => `${targetId}/${f.name}`));
      }
    } catch (storageErr) {
      console.log(`admin-delete-user storage: ${storageErr}`);
    }

    // Xoa auth truoc; FK ON DELETE CASCADE don profile va cac bang con.
    const { error: authErr } =
      await adminClient.auth.admin.deleteUser(targetId);
    if (authErr) throw authErr;
    // Fallback cho DB cu chua co cascade. Service role nen idempotent.
    await adminClient.from("account_recovery").delete().eq("user_id", targetId);
    const { error: profileErr } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", targetId);
    if (profileErr)
      console.log(`admin-delete-user profile fallback: ${profileErr.message}`);
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      msg.includes("authorization") ||
      msg.includes("session") ||
      msg.includes("Admin")
        ? 403
        : 400;
    return c.json({ error: msg }, status);
  }
});

// ─── Delete own account (auth user + profile + avatars) ─────────────────────
// Requires service role: auth.admin.deleteUser cannot run from the browser.
app.post("/server/delete-account", async (c) => {
  try {
    const user = await authenticatedUser(c);
    const userId = user.id;

    // 1) Remove avatar objects under avatars/<userId>/
    try {
      const { data: listed } = await adminClient.storage
        .from("avatars")
        .list(userId);
      if (listed && listed.length > 0) {
        await adminClient.storage
          .from("avatars")
          .remove(listed.map((f) => `${userId}/${f.name}`));
      }
    } catch (storageErr) {
      console.log(`Delete-account storage cleanup: ${storageErr}`);
    }

    // 2) Xoa auth user TRUOC. FK ON DELETE CASCADE se don profile va bang con.
    // Neu DB cu chua co cascade, lenh fallback service-role ben duoi se don profile.
    const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    // 3) Fallback idempotent: khong de profile mo coi neu FK cu chua cascade.
    const { error: profileErr } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profileErr)
      console.log(
        `Delete-account profile fallback failed: ${profileErr.message}`,
      );

    return c.json({ ok: true });
  } catch (err) {
    console.log(`Delete account error: ${err}`);
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      msg.includes("authorization") || msg.includes("session") ? 401 : 400;
    return c.json({ error: msg }, status);
  }
});

Deno.serve(app.fetch);
