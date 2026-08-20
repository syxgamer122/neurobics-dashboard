# TỔNG HỢP HỆ THỐNG XÁC THỰC & ĐĂNG NHẬP (AUTH PACKAGE)

Tài liệu và mã nguồn hoàn chỉnh dành cho AI / Kỹ sư phân tích và xử lý lỗi không đăng nhập được tài khoản.

---

## 1. TỔNG QUAN KIẾN TRÚC & CƠ CHẾ ĐĂNG NHẬP (HOW AUTH WORKS)

1. **Cơ chế Email Ảo (Spoofed / Fake Email Auth)**:
   - Người dùng chỉ đăng ký bằng **Username** và **Password** (không cần nhập email thật).
   - Hệ thống tự động ánh xạ: `username` -> `username@mindgem.local` (hoặc legacy `username@neurobics.local`).
2. **Luồng Đăng Ký (`handleSignUp` / `/server/signup`)**:
   - Client gọi Edge Function `POST /server/signup` kèm Captcha Token và Username/Password.
   - Server dùng Supabase Service Role Key (`adminClient.auth.admin.createUser`) để tạo Auth User và tự động `email_confirm: true`.
   - Trigger PostgreSQL `on_auth_user_created` tự động chèn bản ghi tương ứng vào bảng `public.profiles`.
3. **Luồng Đăng Nhập (`handleLogin`)**:
   - Client dùng `supabase.auth.signInWithPassword({ email: "${username}@mindgem.local", password })`.
   - Nếu thất bại, client thử lại với domain legacy `${username}@neurobics.local`.
4. **Luồng Nạp Hồ Sơ (`fetchProfile`)**:
   - Ngay sau khi `signInWithPassword` thành công, client gọi `fetchProfile()`.
   - Client truy vấn: `supabase.from("profiles_decayed").select(PROFILE_COLS).eq("id", userId).maybeSingle()`.
   - Nếu `fetchProfile()` trả về `null` hoặc lỗi, AuthScreen sẽ hiển thị: *"Signed in, but no neural profile was found for this account. It may predate the new database — please sign up again."*

---

## 2. NGUYÊN NHÂN GỐC RỄ CHÍNH DẪN ĐẾN LỖI KHÔNG ĐĂNG NHẬP ĐƯỢC

### 🔴 NGUYÊN NHÂN 1: THIẾU QUYỀN `SELECT` TRÊN VIEW `profiles_decayed` CHO ROLE `authenticated`
- **Hiện tượng**: Đăng nhập bằng tài khoản đúng mật khẩu vẫn báo lỗi hoặc bị văng ra ngoài.
- **Nguyên nhân**: Trong migration `20260930000000_normalize_pending_schema.sql`, view `profiles_decayed` bị thu hồi quyền:
  ```sql
  REVOKE ALL ON public.profiles_decayed FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.profiles_decayed TO service_role;
  ```
  Nhưng ở Frontend (`src/app/lib/api/profile.ts`), hàm `fetchProfile()` chạy từ trình duyệt với JWT của người dùng đã đăng nhập (`authenticated` role). Vì không có quyền `SELECT` trên `profiles_decayed`, lệnh truy vấn bị lỗi **403 Permission Denied** hoặc trả về rỗng, khiến `auth-screen.tsx` coi như không tìm thấy Profile và chặn đăng nhập.
- **Cách khắc phục**:
  ```sql
  GRANT SELECT ON public.profiles_decayed TO authenticated, service_role;
  ```
  (Hoặc chuyển `fetchProfile()` trong `src/app/lib/api/profile.ts` sang đọc từ `public.profiles`).

---

### 🔴 NGUYÊN NHÂN 2: THIẾU BẢN GHI TRONG `public.profiles` (TRIGGER LỖI)
- **Hiện tượng**: Đăng ký thành công tài khoản trong Supabase Auth nhưng không có dữ liệu trong bảng `public.profiles`.
- **Nguyên nhân**: Trigger `on_auth_user_created` trên bảng `auth.users` bị mất hoặc lỗi khi insert do ràng buộc NOT NULL / CHECK mới.

---

### 🔴 NGUYÊN NHÂN 3: SAI THÔNG TIN KẾT NỐI SUPABASE
- **Hiện tượng**: Báo `Failed to fetch` hoặc `Invalid API Key`.
- **Nguyên nhân**: `.env.local` hoặc biến môi trường VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY chưa khớp với Remote Supabase.

---

## 3. MÃ NGUỒN CHI TIẾT CỦA CÁC FILE LIÊN QUAN


### 📄 src/app/components/auth-screen.tsx (Frontend UI Component (Auth Screen))

```typescript
import { useState } from "react";
import {
  Brain,
  Lock,
  User,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  handleSignUp,
  handleLogin,
  handleGuestSignUp,
  fetchProfile,
  USERNAME_RE,
  type Profile,
} from "../lib/api";
import { useLang } from "../lib/i18n";
import { TurnstileWidget } from "./turnstile-widget";
import { logError } from "../lib/logger";

export function AuthScreen({
  onAuthed,
}: {
  onAuthed: (profile: Profile | null) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "guest">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const { t } = useLang();

  const handleUsernameChange = (v: string) => {
    setUsername(v);
    if (mode === "signup" && usernameError) setUsernameError(false);
    if (error) setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUsernameError(false);

    if (mode !== "guest" && (!username.trim() || !password)) {
      setError("Enter a username and password.");
      return;
    }

    if (mode === "signup" && !USERNAME_RE.test(username.trim())) {
      setError(
        t.username_invalid ??
          "Username must be 3–20 characters: letters, numbers, _ . - only.",
      );
      setUsernameError(true);
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setError(
        t.password_min_length ?? "Password must be at least 8 characters.",
      );
      return;
    }

    if ((mode === "signup" || mode === "guest") && !captchaToken) {
      setError("Please complete the human verification.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { profile } = await handleSignUp(
          username.trim(),
          password,
          captchaToken,
        );
        setSuccess(true);
        setTimeout(() => onAuthed(profile), 1200);
      } else if (mode === "guest") {
        const { profile } = await handleGuestSignUp(captchaToken);
        onAuthed(profile);
      } else {
        // 1. Authenticate (username -> username@mindgem.local under the hood).
        await handleLogin(username.trim(), password);
        // 2. Load the profile row. If auth succeeds but no profile exists,
        //    surface a clear error instead of silently bouncing to login.
        const profile = await fetchProfile();
        if (!profile) {
          throw new Error(
            "Signed in, but no neural profile was found for this account. It may predate the new database — please sign up again.",
          );
        }
        onAuthed(profile);
      }
    } catch (err) {
      logError("Auth error during sign in:", err);
      // strict + useUnknownInCatchVariables: err la unknown, phai thu hep kieu.
      // Pattern giong use-round-submission / settings-panel / admin-panel.
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      // Show the styled DB-constraint block only when a name is genuinely taken.
      if (mode === "signup" && msg.toLowerCase().includes("already taken")) {
        setUsernameError(true);
      }
      setError(msg);
      if (mode === "signup" || mode === "guest") {
        setCaptchaToken("");
        setCaptchaResetKey((key) => key + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 text-foreground relative overflow-hidden bg-background"
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute rounded-full"
          style={{
            top: "-10%",
            left: "20%",
            width: 600,
            height: 600,
            background:
              "radial-gradient(circle, rgba(var(--neuro-cyan-rgb),0.10) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: "-15%",
            right: "10%",
            width: 500,
            height: 500,
            background:
              "radial-gradient(circle, rgba(var(--neuro-purple-rgb),0.10) 0%, transparent 70%)",
          }}
        />
        {/* Extra red glow when error */}
        {usernameError && (
          <div
            className="absolute rounded-full transition-opacity duration-500"
            style={{
              top: "30%",
              left: "30%",
              width: 400,
              height: 400,
              background:
                "radial-gradient(circle, rgba(var(--neuro-red-rgb),0.08) 0%, transparent 70%)",
            }}
          />
        )}
      </div>

      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-8 transition-all duration-300"
        style={{
          background: "rgba(var(--neuro-panel-rgb),0.75)",
          border: usernameError
            ? "1px solid rgba(var(--neuro-red-rgb),0.45)"
            : "1px solid rgba(var(--neuro-cyan-rgb),0.16)",
          backdropFilter: "blur(var(--glass-blur, 18px))",
          boxShadow: usernameError
            ? "0 8px 60px rgba(0,0,0,0.5), 0 0 40px rgba(var(--neuro-red-rgb),0.15)"
            : success
              ? "0 8px 60px rgba(0,0,0,0.5), 0 0 40px rgba(var(--neuro-green-rgb),0.2)"
              : "0 8px 60px rgba(0,0,0,0.5)",
          transition: "box-shadow 0.4s ease, border-color 0.4s ease",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{
              background:
                "linear-gradient(135deg, var(--neuro-cyan), var(--neuro-purple))",
              boxShadow: "0 0 26px rgba(var(--neuro-cyan-rgb),0.4)",
            }}
          >
            <Brain size={22} className="text-foreground" />
          </div>
          <div className="text-lg font-bold tracking-[0.22em] text-foreground font-mono">
            MINDGEM
          </div>
          <div className="text-xs text-slate-500 mt-1">{t.auth_tagline}</div>
        </div>

        {/* Success state overlay */}
        {success && (
          <div
            className="mb-5 rounded-xl p-4 flex flex-col items-center gap-2 text-center"
            style={{
              background: "rgba(var(--neuro-green-rgb),0.08)",
              border: "1px solid rgba(var(--neuro-green-rgb),0.3)",
              boxShadow: "0 0 20px rgba(var(--neuro-green-rgb),0.15)",
            }}
          >
            <CheckCircle2 size={22} className="text-emerald-400" />
            <div className="text-xs font-bold tracking-wider text-emerald-400">
              ACCOUNT CREATED
            </div>
            <div className="text-xs text-emerald-600">
              Welcome, {username}. Initializing neural profile…
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3.5">
          {mode !== "guest" && (
            <>
              {/* Username field */}
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-300"
                style={{
                  background: usernameError
                    ? "rgba(var(--neuro-red-rgb),0.08)"
                    : "rgba(0,0,0,0.3)",
                  border: usernameError
                    ? "1px solid rgba(var(--neuro-red-rgb),0.6)"
                    : "1px solid rgba(var(--neuro-cyan-rgb),0.14)",
                  boxShadow: usernameError
                    ? "0 0 16px rgba(var(--neuro-red-rgb),0.25), inset 0 0 8px rgba(var(--neuro-red-rgb),0.05)"
                    : "none",
                }}
              >
                <span
                  style={{
                    color: usernameError
                      ? "var(--neuro-red)"
                      : "var(--slate-500)",
                  }}
                >
                  <User size={15} />
                </span>
                <input
                  type="text"
                  placeholder={t.username_label}
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  autoComplete="username"
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
                  style={{
                    color: usernameError ? "var(--neuro-red)" : "white",
                  }}
                />
                {usernameError && (
                  <AlertTriangle
                    size={14}
                    className="text-red-400 shrink-0"
                    style={{
                      filter:
                        "drop-shadow(0 0 4px rgba(var(--neuro-red-rgb),0.8))",
                    }}
                  />
                )}
              </div>

              {/* Username error block */}
              {usernameError && (
                <div
                  className="rounded-lg px-3 py-2.5 space-y-1"
                  style={{
                    background: "rgba(var(--neuro-red-rgb),0.06)",
                    border: "1px solid rgba(var(--neuro-red-rgb),0.3)",
                    boxShadow: "0 0 12px rgba(var(--neuro-red-rgb),0.1)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-bold tracking-widest font-mono"
                      style={{ color: "var(--neuro-red)" }}
                    >
                      ✕ DB_CONSTRAINT_VIOLATION
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: "var(--red-300)" }}>
                    ERROR: Username already taken. Please choose another.
                  </div>
                  <div className="text-xs text-red-800">
                    UNIQUE constraint failed: profiles.username
                  </div>
                </div>
              )}

              {/* Password field */}
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(var(--neuro-cyan-rgb),0.14)",
                }}
              >
                <span className="text-slate-500">
                  <Lock size={15} />
                </span>
                <input
                  type="password"
                  placeholder={t.password_label}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-slate-400"
                />
              </div>
            </>
          )}

          {mode === "signup" && (
            <div
              className="text-xs leading-relaxed px-3 py-2 rounded-lg"
              style={{
                background: "rgba(var(--neuro-amber-rgb),0.08)",
                border: "1px solid rgba(var(--neuro-amber-rgb),0.28)",
                color: "var(--neuro-amber)",
              }}
            >
              {t.signup_no_email_warning ??
                "No real email is stored. If you forget this password, only the recovery code shown after sign-up can restore the account. Save it offline."}
            </div>
          )}

          {(mode === "signup" || mode === "guest") && (
            <TurnstileWidget
              onToken={setCaptchaToken}
              resetKey={captchaResetKey}
            />
          )}

          {/* General error (non-username) */}
          {error && !usernameError && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                background: "rgba(var(--neuro-red-rgb),0.1)",
                color: "var(--neuro-red)",
                border: "1px solid rgba(var(--neuro-red-rgb),0.25)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              busy ||
              success ||
              ((mode === "signup" || mode === "guest") && !captchaToken)
            }
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 tracking-wider transition-all duration-200 disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, var(--neuro-cyan), var(--neuro-purple))",
              border: "2px solid var(--background)",
              color: "var(--foreground)",
              boxShadow: "0 0 22px rgba(var(--neuro-cyan-rgb),0.3)",
            }}
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ArrowRight size={15} />
            )}
            {mode === "login" && t.sign_in.toUpperCase()}
            {mode === "signup" && t.sign_up.toUpperCase()}
            {mode === "guest" && t.guest_play.toUpperCase()}
          </button>
        </form>

        {mode === "login" && (
          <div className="mt-4">
            <button
              type="button"
              disabled={busy || success}
              onClick={() => {
                setMode("guest");
                setError(null);
                setUsernameError(false);
              }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold tracking-wider transition-all duration-200 disabled:opacity-60"
              style={{
                background: "rgba(var(--neuro-green-rgb),0.12)",
                color: "#34D399",
                border: "1px solid rgba(var(--neuro-green-rgb),0.35)",
              }}
            >
              {t.guest_play}
            </button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
              {t.guest_hint}
            </p>
          </div>
        )}

        <div className="text-center mt-5 text-xs text-slate-500 space-y-2">
          {mode !== "login" && (
            <div>
              {t.have_account}{" "}
              <button
                onClick={() => setMode("login")}
                className="text-neuro-cyan hover:underline"
              >
                {t.sign_in}
              </button>
            </div>
          )}
          {mode === "login" && (
            <div>
              {t.no_account}{" "}
              <button
                onClick={() => setMode("signup")}
                className="text-neuro-cyan hover:underline"
              >
                {t.sign_up}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

```

---

### 📄 src/app/lib/api/auth.ts (Frontend Auth API Client)

```typescript
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
  const name = assertValidUsername(username);
  return [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS].map(
    (d) => `${name}@${d}`,
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
  const emails = authEmailCandidates(username);
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

```

---

### 📄 src/app/lib/api/profile.ts (Frontend Profile API Client (fetchProfile))

```typescript
/**
 * The signed-in user's own profile: read, birth year, score reset, password,
 * avatar upload/removal and account deletion.
 */
import {
  getSupabase,
  describeError,
  PROFILE_COLS,
  sanitizeProfile,
  hydrateProfile,
  currentUserId,
  serverPost,
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  type Profile,
} from "./internal";
import { logError } from "../logger";

export async function fetchProfile(): Promise<Profile | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await getSupabase()
    .from("profiles_decayed")
    .select(PROFILE_COLS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const msg = describeError(error, "Fetch profile failed");
    logError(msg);
    throw new Error(msg);
  }
  return data ? hydrateProfile(data as Profile) : null;
}

/** Persists the user's birth date, which anchors the brain-age calculation. */
export async function saveBirthDate(birthDate: string): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Save birth date failed: not authenticated.");

  const { error } = await getSupabase()
    .from("profiles")
    .update({ birth_date: birthDate })
    .eq("id", userId);

  if (error) {
    const msg = describeError(error, "Save birth date failed");
    logError(msg);
    throw new Error(msg);
  }

  // Refetch profile to get the updated state (along with any triggers)
  const { data: updated, error: refetchError } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", userId)
    .single();

  if (refetchError) throw refetchError;
  return sanitizeProfile(updated as Profile);
}

/**
 * Deletes the active account end-to-end via the Edge Function (service role):
 * profile row, avatars in storage, and the auth.users record. Then clears the
 * local session so the browser cannot reuse a dead JWT.
 */
export async function deleteActiveUserAccount(): Promise<void> {
  await serverPost<{ ok: true }>("delete-account", {});

  try {
    await getSupabase().auth.signOut();
  } catch {
    /* session may already be invalid after server-side auth.admin.deleteUser */
  }
  try {
    Object.keys(globalThis.localStorage ?? {})
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => globalThis.localStorage.removeItem(k));
  } catch {
    /* localStorage may be unavailable â€” signOut already handled the session */
  }
}

/**
 * Re-authenticate with the current password, then set a new one.
 * Username is mapped to the spoofed email the same way signup/login do.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!currentPassword || !newPassword) {
    throw new Error("Both current and new passwords are required.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  if (currentPassword === newPassword) {
    throw new Error("New password must be different from the current one.");
  }

  const {
    data: { user },
    error: userErr,
  } = await getSupabase().auth.getUser();
  if (userErr || !user?.email) {
    throw new Error("Change password failed: not authenticated.");
  }

  const { error: reauthErr } = await getSupabase().auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthErr) {
    throw new Error("Current password is incorrect.");
  }

  const { error } = await getSupabase().auth.updateUser({
    password: newPassword,
  });
  if (error) {
    throw new Error(error.message || "Change password failed.");
  }
}

/** Upload a new avatar image and persist its public URL on the profile. */
export async function uploadAvatar(file: File): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Upload avatar failed: not authenticated.");

  if (!AVATAR_MIME.has(file.type)) {
    throw new Error("Avatar must be JPEG, PNG, WebP, or GIF.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Avatar must be 2 MB or smaller.");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  // Fixed path so each upload overwrites the previous file for this user.
  const path = `${userId}/avatar.${ext}`;

  // Drop leftover files from previous uploads with a different extension
  // (avatar.jpg left behind after switching to avatar.png, etc.).
  const { data: listed } = await getSupabase()
    .storage.from("avatars")
    .list(userId);
  if (listed && listed.length > 0) {
    const stale = listed
      .map((f) => f.name)
      .filter((name) => name !== `avatar.${ext}`)
      .map((name) => `${userId}/${name}`);
    if (stale.length > 0) {
      await getSupabase().storage.from("avatars").remove(stale);
    }
  }

  const { error: upErr } = await getSupabase()
    .storage.from("avatars")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
  if (upErr) {
    throw new Error(describeError(upErr, "Upload avatar failed"));
  }

  const { data: pub } = getSupabase()
    .storage.from("avatars")
    .getPublicUrl(path);
  // Bust CDN/browser cache after overwrite.
  const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { error } = await getSupabase().rpc("set_my_avatar", {
    p_avatar_url: avatarUrl,
  });
  if (error) {
    throw new Error(describeError(error, "Save avatar URL failed"));
  }

  const { data: updated, error: refetchError } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", userId)
    .single();
  if (refetchError) throw refetchError;
  return hydrateProfile(updated as Profile);
}

/** Remove avatar file(s) for the current user and clear avatar_url. */
export async function removeAvatar(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Remove avatar failed: not authenticated.");

  const { data: listed } = await getSupabase()
    .storage.from("avatars")
    .list(userId);
  if (listed && listed.length > 0) {
    const paths = listed.map((f) => `${userId}/${f.name}`);
    await getSupabase().storage.from("avatars").remove(paths);
  }

  const { error } = await getSupabase().rpc("set_my_avatar", {
    p_avatar_url: null,
  });
  if (error) {
    throw new Error(describeError(error, "Clear avatar URL failed"));
  }

  const { data: updated, error: refetchError } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", userId)
    .single();
  if (refetchError) throw refetchError;
  return hydrateProfile(updated as Profile);
}

```

---

### 📄 src/app/lib/api/internal.ts (Frontend API Internal & Supabase Client Config)

```typescript
/**
 * Shared plumbing for the api modules: the Supabase client singleton,
 * the Profile shape, error formatting, column lists and date helpers.
 *
 * Not part of the public surface - import from "../api" instead.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  FUNCTIONS_BASE,
  assertSupabaseConfig,
} from "../supabase-config";
import { SESSION_COLUMNS, type SessionColumn } from "../game-registry";
import { sanitizeRating } from "../provisional-score";

// ─── Supabase client singleton ───────────────────────────────────────────────
// Stashed on globalThis so that even if this module is evaluated more than once
// (e.g. imported via two different specifiers by the bundler), only ONE
// GoTrueClient is ever created — avoiding the "Multiple GoTrueClient instances"
// warning and the split-session bugs it causes.
const CLIENT_KEY = "__mindgem_supabase_client__";
type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: SupabaseClient };

export function getSupabase(): SupabaseClient {
  const g = globalThis as GlobalWithClient;
  if (!g[CLIENT_KEY]) {
    assertSupabaseConfig();
    g[CLIENT_KEY] = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return g[CLIENT_KEY]!;
}

// Signup still goes through the server: creating an auth user with a confirmed
// email requires the service-role key, which must never reach the browser.
// Everything else reads/writes the genuine public.profiles table directly via
// the authenticated client (RLS scopes writes to the user's own row).
export const BASE = FUNCTIONS_BASE;

export type Profile = {
  id: string;
  username: string;
  // The 5 cognitive axes are proficiency ratings in [0, 1000] (upward-only
  // moving averages), NOT cumulative point totals.
  cfop_spatial_record: number | null; // spatial proficiency rating
  spatial_score: number; // Normalized fallback
  algebraic_logic_score: number; // logic proficiency rating
  memory_score: number; // memory proficiency rating
  speed_score: number; // speed proficiency rating
  focus_score: number; // focus proficiency rating
  total_xp: number; // cumulative XP (drives Level)
  last_active_date: string | null; // YYYY-MM-DD (VN calendar day)
  // Anchors "brain age" to a real age. Nullable: pre-existing accounts never
  // supplied it, and the UI asks for it rather than inventing a number.
  birth_year: number | null;
  // Public avatar URL in the `avatars` storage bucket (nullable until uploaded).
  avatar_url: string | null;
  // Server-controlled: 'user' | 'admin' | 'guest'. Never trust username for privilege.
  role: "user" | "admin" | "guest";
  created_at: string;
} & Record<SessionColumn, number>;

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// ─── Data (genuine public.profiles table) ───────────────────────────────────────

// Turn a PostgrestError (plain object, not an Error) into a readable message.
export const IS_DEV = import.meta.env.DEV;

/**
 * Ca hai fallback duoi day keo hang tram dong ve trinh duyet roi sap xep
 * tai chO. Chung chi ton tai de app khong chet khi migration chua chay —
 * KHONG duoc coi la duong chinh. Neu thay canh bao nay trong production,
 * hay chay migration supabase/migrations/ roi kiem tra lai.
 */
export const MIGRATION_HINT =
  "Run the SQL migrations in supabase/migrations/ to restore the RPC.";

export function describeError(err: unknown, context: string): string {
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  if (e && typeof e === "object") {
    // Production: chi giu message + code. details/hint cua Postgres lo ten bang,
    // ten cot va cau truy van — khong day ra cho nguoi dung cuoi.
    const parts = IS_DEV
      ? [e.message, e.details, e.hint].filter(Boolean)
      : [e.message].filter(Boolean);
    const msg = parts.length
      ? parts.join(" · ")
      : IS_DEV
        ? JSON.stringify(e)
        : "Unexpected error";
    return e.code ? `${context}: [${e.code}] ${msg}` : `${context}: ${msg}`;
  }
  return `${context}: ${IS_DEV ? String(err) : "Unexpected error"}`;
}

/** Check if an error is likely due to network/offline conditions. */
export function isNetworkErrorLike(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch|NetworkError|FetchError|Load failed|offline|network/i.test(
    msg,
  );
}

// Select all columns so the app keeps working before/after the ALTER TABLE
// migration adds memory_score, speed_score, focus_score, last_active_date.
export const PROFILE_COLS =
  "id, username, avatar_url, role, birth_year, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, total_xp, last_active_date, schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions, memory_sessions, nback_sessions, math_sessions, gonogo_sessions, mental_sessions, corsi_sessions, trail_sessions, created_at";

// Danh sách rút gọn dùng cho bảng xếp hạng và thống kê quần thể. Hai truy vấn đó
// đọc hồ sơ của MỌI người chơi, nên tuyệt đối không dùng "*" — làm thế là gửi
// birth_year và mọi cột riêng tư của toàn bộ người dùng về máy từng người.
// Phải viết thắng thành một chuỗi hằng: supabase-js đọc nội dung chuỗi này ở
// tầng kiểu để suy ra kiểu của `data`. Dùng [...].join() sẽ cho kiểu `string`
// chung chung, khiến TypeScript trả về GenericStringError\[\] và báo lỗi ép kiểu.
export const LEADERBOARD_COLS =
  "id, username, avatar_url, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, total_xp, last_active_date, schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions, memory_sessions, nback_sessions, math_sessions, gonogo_sessions, mental_sessions, corsi_sessions, trail_sessions, created_at";

/** Sanitize every cognitive axis on a freshly-fetched profile. */
export function sanitizeProfile(p: Profile): Profile {
  const sessionCounts = Object.fromEntries(
    SESSION_COLUMNS.map((column) => [column, Number(p[column] ?? 0) || 0]),
  ) as Record<SessionColumn, number>;
  const spatialScoreRaw = p.spatial_score ?? p.cfop_spatial_record ?? 0;
  return {
    ...p,
    ...sessionCounts,
    algebraic_logic_score: sanitizeRating(p.algebraic_logic_score),
    focus_score: sanitizeRating(p.focus_score),
    speed_score: sanitizeRating(p.speed_score),
    memory_score: sanitizeRating(p.memory_score),
    cfop_spatial_record: sanitizeRating(p.cfop_spatial_record),
    spatial_score: sanitizeRating(spatialScoreRaw),
  };
}

/**
 * Sanitize profile values. Decay is no longer applied on the client.
 */
export function hydrateProfile(p: Profile): Profile {
  return sanitizeProfile({
    ...p,
    avatar_url: p.avatar_url ?? null,
    birth_year: p.birth_year ?? null,
    role: p.role,
  });
}

/**
 * Updates the current user's row in public.profiles. RLS guarantees a user can
 * only update their own row (auth.uid() = id).
 * scoreType: "cfop_spatial_record" (solve time) or "algebraic_logic_score".
 */

// ─── Timezone utilities ──────────────────────────────────

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Calendar day (YYYY-MM-DD) for a given instant, in Vietnam time (UTC+7). */
export function vnDateString(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d);
}

/** Whole-day difference between two YYYY-MM-DD calendar dates. */
export function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ─── Profile settings (Phase 4) ───────────────────────────────────────────────

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export class ServerError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ServerError";
    this.code = code;
    this.status = status;
  }
}

export async function serverPost<T = void>(
  path: string,
  payload: unknown,
): Promise<T> {
  const token = await getAccessToken();
  if (!token)
    throw new ServerError("Not authenticated.", "unauthenticated", 401);
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({
    error: "Invalid server response",
    code: "invalid_response",
  }));
  if (!res.ok) {
    throw new ServerError(
      body.error ?? `${path} failed (${res.status})`,
      body.code,
      res.status,
    );
  }
  return body as T;
}

export const DEVICE_KEY = "mindgem.device";

/** Dấu vân thô phía client — chỉ tín hiệu tham khảo (localStorage xoá là mất). Chống lạm dụng thật dựa rate-limit IP + captcha phía server. */
export function deviceFingerprint(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        (globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`) +
        `.${screen.width}x${screen.height}x${new Date().getTimezoneOffset()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `anon.${Date.now()}`;
  }
}

/**
 * Mốc 00:00 giờ Việt Nam của ngày hôm nay, tính thẳng từ UTC.
 *
 * Cách cũ (`new Date(now.toLocaleString("en-US", { timeZone: VN_TZ }))` rồi trừ
 * 7 tiếng) chỉ đúng khi trình duyệt chạy ở UTC. Với máy đang ở UTC+7 — tức gần
 * như toàn bộ người dùng — chuỗi giờ tường phân tích lại ra đúng thời điểm hiện
 * tại, trừ thêm 7 tiếng nữa là cửa sổ lùi về 17:00 hôm trước, khiến "XP hôm nay"
 * cộng nhầm cả XP của tối qua.
 */
export function vnDayStartUtc(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return new Date(`${ymd}T00:00:00+07:00`);
}

/** Mốc 00:00 giờ Việt Nam của ngày đầu tháng hiện tại. */
export function vnMonthStartUtc(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00+07:00`);
}

export const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

```

---

### 📄 src/app/hooks/use-app-state.ts (Frontend App State & Auth Hook)

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  getAccessToken,
  fetchProfile,
  handleLogout,
  saveBirthDate,
  fetchPopulationStats,
  fetchActivityStats,
  type Profile,
  type ActivityStats,
  type RoundGame,
  isNetworkErrorLike,
  isGuestProfile,
  currentUserId,
} from "../lib/api";
import {
  DEFAULT_POPULATION,
  type PopulationStats,
} from "../lib/provisional-score";
import { totalSessions } from "../lib/sessions";
import { logError } from "../lib/logger";
import { CALIBRATION_TARGET } from "../components/onboarding";
import { type Translation } from "../lib/i18n";
import type { DockPage } from "../components/floating-dock";
import type { RoundResult } from "../components/ui/round-result-overlay";

export const CACHED_PROFILE_KEY = "mindgem.cached_profile";
const CACHE_TTL_MS = 7 * 24 * 3600_000;

type CachedProfile = {
  userId: string;
  profile: Profile;
  at: string;
};

export function useAppState(t: Translation) {
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p);
    try {
      if (p) {
        (async () => {
          const userId = await currentUserId();
          if (userId && p.id === userId) {
            localStorage.setItem(
              CACHED_PROFILE_KEY,
              JSON.stringify({
                userId: p.id,
                profile: p,
                at: new Date().toISOString(),
              }),
            );
          }
        })();
      } else {
        localStorage.removeItem(CACHED_PROFILE_KEY);
      }
    } catch {
      // Ignore quota/private mode errors
    }
  }, []);

  useEffect(() => {
    profileRef.current = profileState;
  }, [profileState]);

  const [activePage, setActivePage] = useState<DockPage>("dashboard");
  const [selectedGame, setSelectedGame] = useState<RoundGame | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [gamificationKey, setGamificationKey] = useState(0);
  const [popStats, setPopStats] = useState<PopulationStats>(DEFAULT_POPULATION);
  const [birthYearInput, setBirthYearInput] = useState("");
  const [savingAge, setSavingAge] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [showCalibrationComplete, setShowCalibrationComplete] = useState(false);
  const previousRoundsRef = useRef<number | null>(null);

  const roundsPlayed = profileState ? totalSessions(profileState) : 0;

  const onboardingStorageKey = (profileId: string) =>
    `nb_onboarding_seen_${profileId}`;

  const markOnboardingSeen = useCallback(() => {
    if (profileState?.id) {
      try {
        localStorage.setItem(onboardingStorageKey(profileState.id), "1");
      } catch {
        // Thu muc luu the co the bi khoa o private mode.
      }
    }
    setOnboardingDismissed(true);
    setOnboardingOpen(false);
  }, [profileState?.id]);

  const goToCalibration = useCallback(() => {
    markOnboardingSeen();
    setSelectedGame(null);
    setActivePage("play");
  }, [markOnboardingSeen]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          try {
            const p = await fetchProfile();
            setProfile(p);
          } catch (err) {
            if (isNetworkErrorLike(err)) {
              try {
                const userId = await currentUserId();
                const cachedStr = localStorage.getItem(CACHED_PROFILE_KEY);
                const cached = cachedStr
                  ? (JSON.parse(cachedStr) as CachedProfile)
                  : null;
                if (
                  cached?.userId === userId &&
                  Date.now() - Date.parse(cached.at) < CACHE_TTL_MS
                ) {
                  setProfile(cached.profile);
                  return;
                }
              } catch (e) {
                logError("Failed to parse cached profile", e);
              }
            }
            throw err;
          }
        }
      } catch (err) {
        logError("Session restore error:", err);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [setProfile]);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await fetchProfile());
    } catch (err) {
      logError("Refresh profile error:", err);
    }
  }, [setProfile]);

  useEffect(() => {
    const handleSyncComplete = () => {
      void refreshProfile();
    };
    window.addEventListener("offline-sync-complete", handleSyncComplete);
    return () => {
      window.removeEventListener("offline-sync-complete", handleSyncComplete);
    };
  }, [refreshProfile]);

  const popStatsKey =
    profileState && !isGuestProfile(profileState)
      ? (profileState.id ?? "__no_id__")
      : null;

  useEffect(() => {
    if (!popStatsKey) return;
    (async () => {
      try {
        setPopStats(await fetchPopulationStats());
      } catch (err) {
        logError("Population stats unavailable, using seed baseline:", err);
      }
    })();
  }, [popStatsKey]);

  const submitBirthYear = async () => {
    const year = parseInt(birthYearInput, 10);
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(year) || year < 1900 || year > thisYear - 13) {
      toast.error(t.birth_year_invalid);
      return;
    }
    setSavingAge(true);
    try {
      setProfile(await saveBirthDate(`${year}-01-01`));
      setBirthYearInput("");
    } catch (err) {
      logError("Save birth year failed:", err);
      toast.error(t.save_failed);
    } finally {
      setSavingAge(false);
    }
  };

  const onLogout = async () => {
    if (!isGuestProfile(profileState)) {
      await handleLogout();
    }
    setProfile(null);
    setAdminPanelOpen(false);
    setSelectedGame(null);
    setActivePage("dashboard");
    setOnboardingOpen(false);
    setOnboardingDismissed(false);
  };

  const exitGuestToAuth = () => {
    setProfile(null);
    setSelectedGame(null);
    setActivePage("dashboard");
    setOnboardingOpen(false);
    setOnboardingDismissed(false);
  };

  const [activity, setActivity] = useState<ActivityStats>({
    xpToday: 0,
    sessionsThisMonth: 0,
  });

  const activityKey =
    profileState?.id && !isGuestProfile(profileState)
      ? `${profileState.id}:${String(profileState.total_xp)}`
      : null;

  useEffect(() => {
    if (!activityKey) {
      setActivity({ xpToday: 0, sessionsThisMonth: 0 });
      return;
    }
    fetchActivityStats()
      .then(setActivity)
      .catch((err) => logError("Activity stats failed:", err));
  }, [activityKey]);

  useEffect(() => {
    if (!profileState?.id) {
      previousRoundsRef.current = null;
      setOnboardingDismissed(false);
      setOnboardingOpen(false);
      return;
    }

    const previous = previousRoundsRef.current;
    if (
      previous !== null &&
      previous < CALIBRATION_TARGET &&
      roundsPlayed >= CALIBRATION_TARGET
    ) {
      setShowCalibrationComplete(true);
    }
    previousRoundsRef.current = roundsPlayed;

    if (roundsPlayed >= CALIBRATION_TARGET || onboardingDismissed) return;
    try {
      if (localStorage.getItem(onboardingStorageKey(profileState.id)) !== "1") {
        setOnboardingOpen(true);
      }
    } catch {
      setOnboardingOpen(true);
    }
  }, [profileState?.id, roundsPlayed, onboardingDismissed]);

  return {
    adminPanelOpen,
    setAdminPanelOpen,
    accessDenied,
    setAccessDenied,
    authChecked,
    profile: profileState,
    setProfile,
    profileRef,
    refreshProfile,
    activePage,
    setActivePage,
    selectedGame,
    setSelectedGame,
    roundResult,
    setRoundResult,
    gamificationKey,
    setGamificationKey,
    popStats,
    birthYearInput,
    setBirthYearInput,
    submitBirthYear,
    savingAge,
    onboardingOpen,
    setOnboardingOpen,
    showCalibrationComplete,
    setShowCalibrationComplete,
    roundsPlayed,
    markOnboardingSeen,
    goToCalibration,
    onLogout,
    exitGuestToAuth,
    activity,
  };
}

```

---

### 📄 supabase/functions/server/routes/auth.ts (Backend Auth Routes (Edge Function))

```typescript
import type { Hono } from "npm:hono@4.12.27";
import {
  adminClient,
  PROFILE_COLS,
  SIGNUP_LIMIT,
  SIGNUP_WINDOW_SECONDS,
} from "../config.ts";
import {
  authenticatedUser,
  clientIp,
  consumeRateLimit,
  sha256,
  turnstileMessage,
  verifyTurnstile,
} from "../security.ts";
import { logServerEvent, requestIdFor } from "../../_shared/observability.ts";

export function registerAuthRoutes(app: Hono): void {
  // finalize guest upgrade
  app.post("/server/finalize-upgrade", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { targetEmail } = await c.req.json();

      const { error } = await adminClient.rpc("finalize_guest_upgrade_tx", {
        p_user_id: user.id,
        p_target_email: targetEmail,
      });

      if (error) {
        logServerEvent({
          event: "auth.upgrade.finalize_error",
          level: "error",
          userId: user.id,
          message: error.message,
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
      const globalAllowed = await consumeRateLimit(
        "global_signup_budget",
        300,
        60,
      );
      if (!globalAllowed) {
        return c.json(
          { error: "Too many signups globally. Please try again later." },
          429,
        );
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

      const { username, password, captchaToken, isGuest, isAdult } =
        await c.req.json();

      if (!isAdult) {
        return c.json(
          { error: "You must be 13 years or older to use this service." },
          403,
        );
      }

      if (!username && !isGuest) {
        return c.json(
          {
            error: "Signup error: username is required.",
          },
          400,
        );
      }
      if (!captchaToken) {
        return c.json(
          {
            error: "Signup error: human verification is required.",
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
            {
              error:
                "Guest account quota exceeded for this network. Please sign up for a free full account to continue.",
            },
            429,
          );
        }
      }

      // Dem thanh cong thuc su cho rate limit thu 2 (thay vi dung record_signup_attempt som)

      const normalized = isGuest
        ? `guest-${crypto.randomUUID().split("-")[0]}`
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
        await adminClient
          .from("profiles")
          .update({ role: "guest" })
          .eq("id", data.user.id);

        // Generate 12-char alphanumeric recovery code
        recoveryCode = Array.from({ length: 12 }, () =>
          "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(
            Math.floor(Math.random() * 36),
          ),
        ).join("");
        const codeHash = await sha256(recoveryCode);
        await adminClient.from("account_recovery").insert({
          user_id: data.user.id,
          code_hash: codeHash,
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
        return c.json({
          profile,
          _guestName: normalized,
          _guestPw: pw,
          recoveryCode,
        });
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
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        recovery.user_id,
        {
          password: newPw,
        },
      );

      if (updateErr) {
        throw updateErr;
      }

      logServerEvent({
        event: "auth.guest_recovered",
        level: "info",
        userId: recovery.user_id,
        message: "Guest account recovered using code",
        requestId: requestIdFor(c.req.raw),
        persist: true,
      });

      return c.json({
        _guestName: profile.username,
        _guestPw: newPw,
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
      const { data: userAuth, error: authErr } =
        await adminClient.auth.getUser(token);
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

      const { newUsername, newPassword, newEmail, isAdult } =
        await c.req.json();

      if (!isAdult) {
        return c.json(
          { error: "You must be 13 years or older to use this service." },
          403,
        );
      }

      if (
        !/^[a-z0-9_.-]{3,20}$/.test(newUsername?.trim().toLowerCase() || "")
      ) {
        return c.json({ error: "Invalid new username" }, 400);
      }

      if (!newPassword || newPassword.length < 8) {
        return c.json({ error: "Password must be at least 8 characters" }, 400);
      }

      const normalized = newUsername.trim().toLowerCase();
      const targetEmail = newEmail
        ? newEmail.trim()
        : `${normalized}@mindgem.local`;
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
      const { error: opErr } = await adminClient
        .from("upgrade_operations")
        .insert({
          user_id: user.id,
          target_email: targetEmail,
          target_username: normalized,
          status: "pending_verification",
        });

      if (opErr) {
        if (opErr.code === "23505")
          return c.json(
            { error: "An upgrade is already in progress for this account." },
            409,
          );
        throw opErr;
      }

      // Update auth.users (email + password).
      // If spoofed, we auto-confirm. Otherwise, Supabase sends a verification email.
      const { error: updateAuthErr } =
        await adminClient.auth.admin.updateUserById(user.id, {
          email: targetEmail,
          password: newPassword,
          user_metadata: { username: normalized },
          email_confirm: isSpoofed,
        });

      if (updateAuthErr) {
        await adminClient
          .from("upgrade_operations")
          .delete()
          .eq("user_id", user.id);
        throw updateAuthErr;
      }

      // Delete old recovery codes
      await adminClient
        .from("account_recovery")
        .delete()
        .eq("user_id", user.id);

      // Sign out all old sessions globally
      await adminClient.auth.admin.signOut(user.id, "global");

      logServerEvent({
        event: "auth.guest_upgraded",
        level: "info",
        userId: user.id,
        message: `Guest account upgrade initiated to ${isSpoofed ? "spoofed" : "real"} email`,
        requestId: requestIdFor(c.req.raw),
        persist: true,
      });

      return c.json({
        success: true,
        username: normalized,
        requiresLogin: true,
        pendingVerification: !isSpoofed,
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

```

---

### 📄 docs/adr/0001-fake-email-auth.md (Architecture Decision Record: Fake Email Auth)

```markdown
# ADR 0001: Fake Email Authentication (Guest Mode)

## Status
Superseded by [ADR 0007](0007-guest-server-side.md)

## Context
MindGem cần một cách để người dùng trải nghiệm ngay lập tức (Guest Mode) mà không cần đăng ký rườm rà. Tuy nhiên, hệ thống Supabase sử dụng Row Level Security (RLS) gắn liền với hàm `auth.uid()`, đòi hỏi mọi request sửa đổi dữ liệu (insert/update) phải thuộc về một User được xác thực bởi Supabase Auth.

## Decision
Chúng ta quyết định tạo ra một luồng "Fake Email" ẩn dưới màn hình "Guest Mode".
Khi user bấm "Chơi ngay" (Guest), client sẽ tự động sinh ra một email ảo (ví dụ: `guest-uuid@neurobics.local`) và đăng ký nó với Supabase Auth bằng một mật khẩu ngẫu nhiên. Mật khẩu này được lưu trong LocalStorage.
Về phía backend, hệ thống coi đây là một user hoàn toàn hợp lệ, nhưng trường `role` trong bảng `profiles` sẽ được đánh dấu là `guest`.

## Consequences
- **Điểm lợi**: Giữ nguyên kiến trúc RLS. Backend không cần viết thêm các ngoại lệ (bypass) bảo mật cho Guest. Khi Guest muốn nâng cấp thành tài khoản thật, chỉ cần Update Email và Password.
- **Điểm bất lợi**: Gây "rác" database auth nếu Guest không quay lại. (Đã khắc phục bằng Data Retention Policy xóa guest bỏ hoang).

```

---

### 📄 docs/adr/0007-guest-server-side.md (Architecture Decision Record: Guest Mode Server Side)

```markdown
# ADR 0007: Guest Server-Side Provisioning

**Status**: Accepted (Supersedes ADR 0001)

## Context
In ADR 0001, we implemented a client-side fake-email generator that stored a random password in IndexedDB. This "Guest Local" mode allowed users to play immediately without signing up, computing scores entirely in the browser. 

However, this architecture caused several issues:
1. **Security/Abuse**: The `/server/submit-round` endpoint had to conditionally bypass JWT validation for guest IDs, making it an open door for spoofing.
2. **Duplicate Logic**: We had to maintain duplicate scoring algorithms in `src/app/lib/guest.ts` and `supabase/functions/server/routes/scoring.ts`.
3. **Complexity**: Transitioning a "Guest Local" to a full account required migrating local data to the server, resolving conflicts, and replaying telemetry.

## Decision
We decided to adopt a **True Auth Server-Side Provisioning** model for guests:
- Guests are now provisioned by calling `/server/signup` with an empty payload. 
- The Edge Function generates a secure random UUID-based email and strong password.
- The signup request is protected by Cloudflare Turnstile to prevent bot abuse.
- The guest logs in through the standard Supabase Auth flow, receiving a standard JWT.
- A `role` column in `profiles` is set to `'guest'`.
- Guest plays are routed through the exact same `/server/submit-round` endpoint as authenticated users.

## Consequences
- **Positive**: Removed all client-side scoring logic (`guest.ts`). 
- **Positive**: Closed the unauthenticated endpoint loophole; all requests now require a valid JWT.
- **Positive**: Transitioning to a real account only requires an `UPDATE profiles SET role = 'user'` (plus changing the email/password via Supabase Auth), rather than migrating data.
- **Negative**: Guests must be online to initiate their first session (to get the JWT). 

```

---

### 📄 docs/adr/0009-guest-account-upgrade.md (Architecture Decision Record: Guest Upgrade)

```markdown
# ADR-0009: Guest Account Upgrade Strategy

## Trạng thái (Status)
Accepted (2026-08-16)

## Bối cảnh (Context)
Người dùng Guest muốn giữ lại dữ liệu khi đổi thiết bị. Trước đây có tài liệu gợi ý chỉ cần gọi `supabase.auth.updateUser` từ client. Tuy nhiên, việc client tự cập nhật không thể thay đổi an toàn trường `role` trong bảng `profiles` (bởi quyền UPDATE trên profiles đã bị khóa). Ngoài ra, nếu cho phép tự do gọi `updateUser`, kẻ tấn công có thể lợi dụng để leo thang đặc quyền.

## Giải pháp (State Machine)
Sử dụng endpoint đặc quyền trên server: `/server/upgrade-account` kết hợp với hệ thống **State Machine** lưu trong bảng `upgrade_operations`.

Quá trình thăng cấp diễn ra theo 5 bước (State Machine):
1. **pending_verification**: Guest gọi API `/server/upgrade-account` với email thực. Hệ thống sinh một `upgrade_operations` cho user với trạng thái pending, rồi gọi Supabase Auth gửi OTP.
2. **email_verified**: User nhập OTP thành công trên Supabase Auth.
3. **credentials_bound**: Server thiết lập mật khẩu mới do người dùng cung cấp.
4. **old_sessions_revoked**: Revoke toàn bộ JWT / session cũ của guest proxy để chống rò rỉ.
Trigger email chỉ chuyển `pending_verification -> email_verified`.
5. **completed**: Quá trình promote thực sự dùng duy nhất RPC `finalize_guest_upgrade_tx` (chỉ chạy sau khi `old_sessions_revoked` -> khóa upgrade_operation -> xác minh `target_email` & `expired/consumed` -> update `role = user` -> update operation = `completed` -> lưu `upgraded_at` -> commit).
   Sau hoàn tất: Yêu cầu đăng nhập lại. Các endpoint nhạy cảm từ chối token có `iat < upgraded_at`. Email thay đổi KHÔNG BAO GIỜ tự động thăng cấp role. Việc thăng cấp chỉ diễn ra qua RPC `finalize_guest_upgrade_tx` có khóa `FOR UPDATE` và đối chiếu session.

Yêu cầu CSDL:
```sql
CREATE UNIQUE INDEX one_live_upgrade_per_user ON public.upgrade_operations (user_id) 
WHERE state IN ('pending_verification', 'email_verified', 'credentials_bound', 'old_sessions_revoked');
```

Các trạng thái lỗi của operation:
- `expired`: Operation quá hạn.
- `failed`: Lỗi hệ thống hoặc sai mật khẩu.
- `cancelled`: Bị thay thế bằng operation mới.

Mỗi transition cần kiểm tra:
- Operation thuộc đúng user.
- User hiện vẫn là guest.
- Email mới khớp với `target_email` của operation.
- Operation chưa hết hạn và chưa bị consumed.
- Chỉ có tối đa một operation pending trên mỗi user (unique constraint).
- Replay attack được xử lý bằng kết quả idempotent.

## Hệ quả (Consequences)
- Dữ liệu hoàn toàn được giữ nguyên và UUID của tài khoản không đổi.
- Quy trình đảm bảo bảo mật cao, chống session hijacking.

```

---

### 📄 SIGNUP_SECURITY_SETUP.md (Signup Security Setup Guide)

```markdown
# Thiết lập bảo mật đăng ký Mindgem

## 1. Tạo Cloudflare Turnstile

1. Đăng nhập Cloudflare Dashboard.
2. Mở **Turnstile** > **Add widget**.
3. Thêm hostname production của Vercel và `localhost` để thử trên máy.
4. Chọn **Managed** rồi tạo widget.
5. Sao chép **Site Key** và **Secret Key**. Không đưa Secret Key vào GitHub/Vercel frontend.

## 2. Cấu hình frontend trên Vercel

Trong Vercel > Project > Settings > Environment Variables, thêm:

```text
VITE_TURNSTILE_SITE_KEY=<Site Key từ Cloudflare>
```

Áp dụng cho Production và Preview, sau đó redeploy.

Để chạy local, tạo `.env.local` (file này đã bị Git bỏ qua):

```text
VITE_TURNSTILE_SITE_KEY=<Site Key từ Cloudflare>
```

## 3. Tạo rate limiter trong Supabase

Mở Supabase > SQL Editor. Sao chép toàn bộ nội dung file:

```text
supabase/migrations/20260730_signup_security.sql
```

Dán vào query mới và bấm **Run**. Migration tạo bảng chỉ lưu SHA-256 của IP, bật RLS và tạo RPC nguyên tử giới hạn 5 lần/15 phút.

## 4. Cài Secret Key cho Edge Function

Không đặt Secret Key trong `.env` của Vercel. Secret này thuộc Supabase Edge Function.

```powershell
npx supabase login
npx supabase link --project-ref pujzeomddvquxeacblvr
npx supabase secrets set TURNSTILE_SECRET_KEY=YOUR_CLOUDFLARE_SECRET_KEY
```

## 5. Deploy Edge Function

```powershell
npx supabase functions deploy server
```

Chỉ push GitHub/Vercel là chưa đủ: `supabase/functions/server/index.tsx` phải được deploy lại lên Supabase.

## 6. Build và deploy frontend

```powershell
npm run build
git add .
git commit -m "Protect signup with Turnstile and rate limiting"
git push origin main
```

## 7. Kiểm thử

1. Mở Sign up: widget Turnstile phải xuất hiện.
2. Khi chưa xác minh, nút Sign up bị khóa.
3. Xác minh rồi tạo một tài khoản thử.
4. Gửi quá 5 lần trong 15 phút từ cùng IP: server phải trả HTTP 429.
5. Trong Supabase Table Editor, `signup_rate_limits` chỉ chứa hash, không chứa IP thô.

Turnstile token được server xác minh qua Siteverify; token hết hạn sau 5 phút và chỉ dùng một lần.

```

---
