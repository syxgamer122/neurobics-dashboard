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

/** Result of upgrading a guest to a full account (see POST /server/upgrade-account). */
export type UpgradeGuestResult = {
  success: boolean;
  username: string;
  requiresLogin: boolean;
  pendingVerification: boolean;
};

/** Credentials restored via a guest recovery code (see POST /server/recover). */
export type RecoverGuestResult = {
  _guestName: string;
  _guestPw: string;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function handleSignUp(
  username: string,
  password: string,
  captchaToken: string,
): Promise<{ profile: Profile }> {
  const safeName = assertValidUsername(username);
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (!captchaToken || !captchaToken.trim()) {
    throw new Error("Captcha verification is required.");
  }
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
  const body = (await res
    .json()
    .catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
  if (!res.ok) {
    logError("Sign up failed during account creation:", body);
    const reason = String(body.error ?? "Sign up failed.");
    const code = typeof body.code === "string" ? body.code : null;
    throw new Error(code ? `${reason} [${code}]` : reason);
  }

  await handleLogin(safeName, password);
  return {
    profile: sanitizeProfile(body.profile as Profile),
  };
}

export async function handleGuestSignUp(captchaToken: string): Promise<{
  profile: Profile;
  recoveryCode?: string;
  guestUsername?: string;
}> {
  if (!captchaToken || !captchaToken.trim()) {
    throw new Error("Captcha verification is required.");
  }
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ isGuest: true, captchaToken, isAdult: true }),
  });
  const body = (await res
    .json()
    .catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
  if (!res.ok) {
    logError("Guest sign up failed:", body);
    const reason = String(
      body.error ?? "Guest mode is temporarily unavailable.",
    );
    const code = typeof body.code === "string" ? body.code : null;
    throw new Error(code ? `${reason} [${code}]` : reason);
  }

  // Edge function returns the generated credentials for the guest.
  // _guestPw stays internal (login only) — never returned or logged.
  // recoveryCode is optional for backwards compatibility with older servers.
  const guestName = typeof body._guestName === "string" ? body._guestName : "";
  const guestPw = typeof body._guestPw === "string" ? body._guestPw : "";
  const recoveryCode =
    typeof body.recoveryCode === "string" && body.recoveryCode.length > 0
      ? body.recoveryCode
      : undefined;
  const profile = sanitizeProfile(body.profile as Profile);
  // Orphan guard: signup đã tạo user + recoveryCode ở server. Nếu login
  // fail (offline/token), vẫn phải trả code cho UI qua error để user lưu.
  try {
    await handleLogin(guestName, guestPw);
  } catch (loginErr) {
    const msg =
      loginErr instanceof Error
        ? loginErr.message
        : "Guest login failed after signup.";
    throw Object.assign(
      new Error(`${msg} (Account created — save your recovery code.)`),
      {
        ...(recoveryCode ? { recoveryCode } : {}),
        ...(guestName ? { guestUsername: guestName } : {}),
      },
    );
  }
  return {
    profile,
    ...(recoveryCode ? { recoveryCode } : {}),
    ...(guestName ? { guestUsername: guestName } : {}),
  };
}

export async function handleLogin(
  username: string,
  password: string,
): Promise<string> {
  const supabase = getSupabase();
  const trimmed = username.trim();
  if (!trimmed) throw new Error("Username is required.");
  if (!password) throw new Error("Password is required.");
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
    // Redacted: never log spoofed emails or passwords — only lengths/codes.
    logError(
      "Login failed during signInWithPassword:",
      error?.code ?? error?.message ?? "unknown",
      `(username length: ${trimmed.length})`,
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
): Promise<UpgradeGuestResult> {
  const safeName = assertValidUsername(username);
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const token = await getAccessToken();
  if (!token) throw new Error("Not logged in");
  const normalizedEmail = email?.trim() ? email.trim() : undefined;
  const res = await fetch(`${BASE}/upgrade-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      newUsername: safeName,
      newPassword: password,
      newEmail: normalizedEmail,
      isAdult,
    }),
  });
  const body = (await res
    .json()
    .catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
  if (!res.ok) {
    const reason = String(body.error ?? "Upgrade failed.");
    const code = typeof body.code === "string" ? body.code : null;
    throw new Error(code ? `${reason} [${code}]` : reason);
  }
  // Server has signed out all sessions globally. Do NOT auto-login here:
  // when pendingVerification is true the user must verify email first,
  // so the UI routes to check-mail; otherwise the UI drives the next login.
  return {
    success: Boolean(body.success),
    username: typeof body.username === "string" ? body.username : safeName,
    requiresLogin:
      typeof body.requiresLogin === "boolean" ? body.requiresLogin : true,
    pendingVerification: Boolean(body.pendingVerification),
  };
}

export async function handleRecoverGuest(
  recoveryCode: string,
): Promise<RecoverGuestResult> {
  if (!recoveryCode || !recoveryCode.trim()) {
    throw new Error("Recovery code is required.");
  }
  const res = await fetch(`${BASE}/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ recoveryCode: recoveryCode.trim() }),
  });
  const body = (await res
    .json()
    .catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
  if (!res.ok) {
    const reason = String(body.error ?? "Recovery failed.");
    const code = typeof body.code === "string" ? body.code : null;
    throw new Error(code ? `${reason} [${code}]` : reason);
  }
  const guestName = body._guestName;
  const guestPw = body._guestPw;
  if (
    typeof guestName !== "string" ||
    !guestName ||
    typeof guestPw !== "string" ||
    !guestPw
  ) {
    throw new Error("Recovery failed.");
  }
  return { _guestName: guestName, _guestPw: guestPw };
}
