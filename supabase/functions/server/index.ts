// @ts-nocheck
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import { scoreAndValidate, type Game } from "../_shared/round-scoring.ts";

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
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-real-ip") ??
    forwarded ??
    "unknown"
  );
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
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
  if (!result.success)
    console.log(
      `Turnstile rejected signup: ${(result["error-codes"] ?? []).join(", ")}`,
    );
  return result.success === true;
}

app.get("/server/health", (c) => c.json({ status: "ok" }));

// ─── Sign up (username + password via email-spoofing) ────────────────────────
// Creating a confirmed auth user needs the service role, so this stays on the
// server. The on_auth_user_created trigger auto-inserts the public.profiles row.
app.post("/server/signup", async (c) => {
  try {
    const ip = clientIp(c);
    const ipHash = await sha256(`neurobics-signup:${ip}`);
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

    if (!(await verifyTurnstile(String(captchaToken), ip))) {
      return c.json(
        { error: "Human verification failed or expired. Please try again." },
        400,
      );
    }

    const normalized = String(username).trim().toLowerCase();

    // Case-insensitive uniqueness check against the genuine profiles table.
    const { data: existing, error: lookupErr } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("username", normalized)
      .maybeSingle();
    if (lookupErr) {
      console.log(
        `Signup error during username lookup for "${username}": ${lookupErr.message}`,
      );
      return c.json({ error: `Signup error: ${lookupErr.message}` }, 500);
    }
    if (existing) {
      return c.json(
        { error: `Signup error: username "${username}" is already taken.` },
        409,
      );
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
      console.log(
        `Signup error while creating auth user for "${username}": ${error?.message}`,
      );
      return c.json(
        {
          error: `Signup error: ${error?.message ?? "could not create user."}`,
        },
        400,
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
      return c.json(
        {
          error: `Signup error: profile was not auto-created (${profileErr?.message ?? "missing row"}).`,
        },
        500,
      );
    }

    return c.json({ profile });
  } catch (err) {
    console.log(`Signup error (unexpected) in /signup route: ${err}`);
    return c.json({ error: `Signup error: ${err}` }, 500);
  }
});
// ─── Secure round lifecycle ────────────────────────────────────────────────
const GAMES = new Set(["schulte", "sudoku", "stroop", "reaction", "memory"]);

async function authenticatedUser(c: any) {
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
    if (!GAMES.has(String(game))) return c.json({ error: "Invalid game" }, 400);

    const { data, error } = await adminClient
      .from("round_tickets")
      .insert({ user_id: user.id, game: String(game) })
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
    const { roundId, game, telemetry } = await c.req.json();
    if (!roundId || !GAMES.has(String(game)))
      return c.json({ error: "roundId and valid game are required" }, 400);

    const { data: ticket, error: ticketError } = await adminClient
      .from("round_tickets")
      .select("id, user_id, game, started_at, expires_at, submitted_at")
      .eq("id", String(roundId))
      .eq("user_id", user.id)
      .single();
    if (ticketError || !ticket)
      return c.json({ error: "Round ticket not found" }, 404);
    if (ticket.game !== game)
      return c.json({ error: "Round game mismatch" }, 400);
    if (ticket.submitted_at)
      return c.json({ error: "Round already submitted" }, 409);
    if (Date.parse(ticket.expires_at) < Date.now())
      return c.json({ error: "Round ticket expired" }, 410);

    const serverElapsedMs = Date.now() - Date.parse(ticket.started_at);
    const scored = scoreAndValidate(game as Game, telemetry, serverElapsedMs);
    const axisPayload = Object.fromEntries(
      Object.entries(scored.axes).filter(([, value]) => value !== null),
    );

    const { data, error } = await adminClient.rpc("submit_round_transaction", {
      p_user_id: user.id,
      p_ticket_id: String(roundId),
      p_game: String(game),
      p_axes: axisPayload,
      p_round_score: scored.headline,
    });
    if (error) throw error;

    return c.json({
      ...data,
      axes: scored.axes,
      headline: scored.headline,
      label: scored.label,
      timeMs: scored.timeMs,
    });
  } catch (err) {
    console.log(`Submit round error: ${err}`);
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { error: message },
      message.includes("already submitted") ? 409 : 400,
    );
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
    .select("username")
    .eq("id", userId)
    .single();
  if (error || data?.username?.trim().toLowerCase() !== "nguyenhuumanh")
    throw new Error("Admin access denied");
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
      .select("*")
      .eq("id", targetId)
      .single();
    if (readError || !target) throw readError ?? new Error("Target not found");
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
      patch.total_xp = Math.max(0, Math.round(next));
    }
    if (!Object.keys(patch).length)
      return c.json({ error: "Nothing to update" }, 400);
    const { data, error } = await adminClient
      .from("profiles")
      .update(patch)
      .eq("id", targetId)
      .select("*")
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
      schulte_sessions: 0,
      sudoku_sessions: 0,
      stroop_sessions: 0,
      reaction_sessions: 0,
      memory_sessions: 0,
      total_xp: 0,
      last_active_date: null,
    };
    const { data, error } = await adminClient
      .from("profiles")
      .update(patch)
      .eq("id", targetId)
      .select("*")
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

Deno.serve(app.fetch);
