/**
 * Account lifecycle: username rules, sign up, login, logout, access token
 * and recovery-code password reset.
 */
import {
  getSupabase,
  BASE,
  sanitizeProfile,
  type Profile,
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
/** Domain cũ — user đã signup trước khi rebrand vẫn dùng domain này trong auth.users. */
export const LEGACY_AUTH_EMAIL_DOMAIN = "neurobics.local";

function authEmailCandidates(username: string): string[] {
  const name = assertValidUsername(username);
  // Mindgem trước, legacy sau — signup mới luôn trúng candidate đầu.
  return [`${name}@${AUTH_EMAIL_DOMAIN}`, `${name}@${LEGACY_AUTH_EMAIL_DOMAIN}`];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type SignUpResult = {
  profile: Profile;
  /** Mã khôi phục một lần — chỉ hiện ngay lúc đăng ký, server không lưu bản rõ. */
  recoveryCode: string;
};

export async function handleSignUp(
  username: string,
  password: string,
  captchaToken: string,
): Promise<SignUpResult> {
  const safeName = assertValidUsername(username);
  // Server creates the confirmed auth user; the on_auth_user_created trigger
  // auto-inserts the matching public.profiles row.
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ username: safeName, password, captchaToken }),
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
    recoveryCode: String(body.recoveryCode ?? ""),
  };
}

/** Đặt lại mật khẩu bằng mã khôi phục đã cấp lúc đăng ký (email giả không nhận được mail). */
export async function resetPasswordWithRecoveryCode(
  username: string,
  recoveryCode: string,
  newPassword: string,
  captchaToken: string,
): Promise<void> {
  if (!username.trim() || !recoveryCode.trim() || !newPassword) {
    throw new Error("Username, recovery code and new password are required.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  const res = await fetch(`${BASE}/recover-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      username: username.trim(),
      recoveryCode: recoveryCode.trim(),
      newPassword,
      captchaToken,
    }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const reason = String(body.error ?? "Recovery failed.");
    throw new Error(body.code ? `${reason} [${body.code}]` : reason);
  }
}

export async function handleLogin(
  username: string,
  password: string,
): Promise<string> {
  const supabase = getSupabase();
  const emails = authEmailCandidates(username);
  let data: Awaited<
    ReturnType<typeof supabase.auth.signInWithPassword>
  >["data"] | null = null;
  let error: Awaited<
    ReturnType<typeof supabase.auth.signInWithPassword>
  >["error"] | null = null;

  for (const email of emails) {
    const res = await supabase.auth.signInWithPassword({ email, password });
    data = res.data;
    error = res.error;
    if (!error && res.data.session) break;
  }

  if (error || !data?.session) {
    logError(
      "Login failed during signInWithPassword:",
      error?.message,
      "(emails:",
      emails.join(", "),
      ")",
    );
    // Supabase returns the same generic message whether the account doesn't
    // exist or the password is wrong — make it actionable.
    if (error?.message?.toLowerCase().includes("invalid login credentials")) {
      throw new Error(
        `No account matched "${username.trim()}" / that password. If you haven't registered on this database yet, switch to Sign up to create it.`,
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
