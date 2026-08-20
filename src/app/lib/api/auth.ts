/**
 * Account lifecycle: username rules, sign up, login, logout, access token
 * and recovery-code password reset.
 */
import {
  getSupabase,
  BASE,
  sanitizeProfile,
  type Profile,
  getAccessToken,
} from "./internal";
import { logError } from "../logger";
// Signup/login goi thang REST nen van can anon key o day.
import { SUPABASE_ANON_KEY } from "../supabase-config";

// Username -> spoofed email so users never provide a real email address.
export const USERNAME_RE = /^[a-z0-9_.-]{3,20}$/i;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Reject spaces/@/unicode before they become invalid spoofed emails. */
export function assertValidUsername(username: string): string {
  const n = normalizeUsername(username);
  if (!USERNAME_RE.test(n)) {
    throw new Error(
      "Username must be 3–20 characters: letters, numbers, _ . - only.",
    );
  }
  return n;
}

/** Domain email giả cho tài khoản mới (brand Mindgem). */
export const AUTH_EMAIL_DOMAIN = "mindgem.local";
export const LEGACY_AUTH_EMAIL_DOMAINS = ["neurobics.local"] as const;

function authEmailCandidates(username: string): string[] {
  const name = username.trim().toLowerCase();
  return [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS].map(
    (d) => `${name}@${d}`,
  );
}

function isInvalidCredentials(
  error: { code?: string; message?: string } | null,
): boolean {
  return (
    error?.code === "invalid_credentials" ||
    /invalid login credentials/i.test(error?.message ?? "")
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function handleSignUp(
  username: string,
  password: string,
  captchaToken: string,
): Promise<{ profile: Profile }> {
  const safeName = assertValidUsername(username);
  // Server creates the confirmed auth user; the on_auth_user_created trigger
  // auto-inserts the matching public.profiles row.
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      username: safeName,
      password,
      captchaToken,
      isAdult: true,
    }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    logError("Sign up failed during account creation:", body);
    const reason = String(body.error ?? "Sign up failed.");
    throw new Error(body.code ? `${reason} [${body.code}]` : reason);
  }

  await handleLogin(safeName, password);
  return {
    profile: sanitizeProfile(body.profile as Profile),
  };
}

export async function handleGuestSignUp(
  captchaToken: string,
): Promise<{ profile: Profile }> {
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ isGuest: true, captchaToken, isAdult: true }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    logError("Guest sign up failed:", body);
    const reason = String(
      body.error ?? "Guest mode is temporarily unavailable.",
    );
    throw new Error(body.code ? `${reason} [${body.code}]` : reason);
  }

  // Edge function returns the generated credentials for the guest
  await handleLogin(String(body._guestName), String(body._guestPw));
  return {
    profile: sanitizeProfile(body.profile as Profile),
  };
}

export async function handleLogin(
  username: string,
  password: string,
): Promise<string> {
  const supabase = getSupabase();
  const trimmed = username.trim();
  if (!trimmed) throw new Error("Username is required.");
  const emails = authEmailCandidates(trimmed);
  let data:
    | Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"]
    | null = null;
  let error:
    | Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"]
    | null = null;

  for (const email of emails) {
    const res = await supabase.auth.signInWithPassword({ email, password });
    data = res.data;
    error = res.error;
    if (!error && res.data.session) break;
    // If it's a network error or rate limit, fail fast instead of hammering fallback domains
    if (error && !isInvalidCredentials(error)) {
      break;
    }
  }

  if (error || !data?.session) {
    logError(
      "Login failed during signInWithPassword:",
      error?.message,
      "(emails:",
      emails.join(", "),
      ")",
    );
    if (isInvalidCredentials(error)) {
      throw new Error(
        `No account matched "${trimmed}" with that password. If you haven't registered on this database yet, switch to Sign up to create it.`,
      );
    }
    throw new Error(error?.message ?? "Invalid username or password.");
  }
  return data.session.access_token;
}

export async function handleLogout(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) logError("Logout error during signOut:", error.message);
}

export async function handleUpgradeGuest(
  username: string,
  email: string,
  password: string,
  isAdult: boolean,
): Promise<{ profile: Profile }> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not logged in");
  const res = await fetch(`${BASE}/upgrade-guest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username, email, password, isAdult }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const reason = String(body.error ?? "Upgrade failed.");
    throw new Error(body.code ? `${reason} [${body.code}]` : reason);
  }
  // Re-login with new credentials to update auth session
  await handleLogin(username, password);
  return { profile: sanitizeProfile(body.profile as Profile) };
}
