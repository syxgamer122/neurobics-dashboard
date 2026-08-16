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
                    color: usernameError ? "var(--neuro-red)" : "var(--slate-500)",
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
                      filter: "drop-shadow(0 0 4px rgba(var(--neuro-red-rgb),0.8))",
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
            disabled={busy || success || ((mode === "signup" || mode === "guest") && !captchaToken)}
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
