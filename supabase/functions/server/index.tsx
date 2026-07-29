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

app.get("/make-server-1e03ae23/health", (c) => c.json({ status: "ok" }));

// ─── Sign up (username + password via email-spoofing) ────────────────────────
// Creating a confirmed auth user needs the service role, so this stays on the
// server. The on_auth_user_created trigger auto-inserts the public.profiles row.
app.post("/make-server-1e03ae23/signup", async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) {
      return c.json({ error: "Signup error: username and password are required." }, 400);
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

Deno.serve(app.fetch);
