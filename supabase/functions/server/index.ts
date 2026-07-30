// @ts-nocheck
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";

const app = new Hono();

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
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

const PROFILE_COLS = "*";
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_SECONDS = 15 * 60;

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(c: any): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? forwarded ?? "unknown";
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured.");

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(`Turnstile Siteverify returned HTTP ${response.status}.`);

  const result = await response.json() as { success?: boolean; "error-codes"?: string[] };
  if (!result.success) console.log(`Turnstile rejected signup: ${(result["error-codes"] ?? []).join(", ")}`);
  return result.success === true;
}

app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Sign up (username + password via email-spoofing) ────────────────────────
// Creating a confirmed auth user needs the service role, so this stays on the
// server. The on_auth_user_created trigger auto-inserts the public.profiles row.
app.post("/signup", async (c) => {
  try {
    const ip = clientIp(c);
    const ipHash = await sha256(`neurobics-signup:${ip}`);
    const { data: allowed, error: rateError } = await adminClient.rpc("check_signup_rate_limit", {
      p_key: ipHash,
      p_limit: SIGNUP_LIMIT,
      p_window_seconds: SIGNUP_WINDOW_SECONDS,
    });

    if (rateError) {
      console.log(`Signup rate-limit error: ${rateError.message}`);
      return c.json({ error: "Signup is temporarily unavailable. Please try again later." }, 503);
    }
    if (allowed !== true) {
      return c.json({ error: "Too many signup attempts. Please wait 15 minutes and try again." }, 429);
    }

    const { username, password, captchaToken } = await c.req.json();
    if (!username || !password || !captchaToken) {
      return c.json({ error: "Signup error: username, password and human verification are required." }, 400);
    }

    if (!(await verifyTurnstile(String(captchaToken), ip))) {
      return c.json({ error: "Human verification failed or expired. Please try again." }, 400);
    }

    const normalized = String(username).trim().toLowerCase();

    // Case-insensitive uniqueness check against the genuine profiles table.
    const { data: existing, error: lookupErr } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("username", normalized)
      .maybeSingle();
    if (lookupErr) {
      console.log(`Signup error during username lookup for "${username}": ${lookupErr.message}`);
      return c.json({ error: `Signup error: ${lookupErr.message}` }, 500);
    }
    if (existing) {
      return c.json({ error: `Signup error: username "${username}" is already taken.` }, 409);
    }

    // Email-spoofing trick so users only need a username.
    const email = `${normalized}@neurobics.local`;

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: { username },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });

    if (error || !data?.user) {
      console.log(`Signup error while creating auth user for "${username}": ${error?.message}`);
      return c.json({ error: `Signup error: ${error?.message ?? "could not create user."}` }, 400);
    }

    // The trigger has already created the profile row within the same
    // transaction — read it back to return to the client.
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", data.user.id)
      .single();

    if (profileErr || !profile) {
      console.log(`Signup error: profile row not found after user creation: ${profileErr?.message}`);
      return c.json({ error: `Signup error: profile was not auto-created (${profileErr?.message ?? "missing row"}).` }, 500);
    }

    return c.json({ profile });
  } catch (err) {
    console.log(`Signup error (unexpected) in /signup route: ${err}`);
    return c.json({ error: `Signup error: ${err}` }, 500);
  }
});
// --- Award XP (called after each game round) ---
app.post("/award-xp", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: "Missing authorization" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { game, roundScore } = await c.req.json();
    if (!game || roundScore === undefined) {
      return c.json({ error: "game and roundScore are required" }, 400);
    }

    const { data, error } = await userClient.rpc("award_xp", {
      p_game: String(game),
      p_round_score: Math.max(0, Math.min(1000, Math.round(Number(roundScore)))),
    });

    if (error) {
      console.log(`Award XP error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    const row = (data as any[])[0];
    if (!row) {
      return c.json({ error: "No result from award_xp" }, 500);
    }

    return c.json({
      totalXp: Number(row.total_xp),
      xpAwarded: Number(row.xp_awarded),
      level: Number(row.new_level),
      leveledUp: Boolean(row.leveled_up),
    });
  } catch (err) {
    console.log(`Award XP error: ${err}`);
    return c.json({ error: String(err) }, 500);
  }
});

Deno.serve(app.fetch);
