import { useState } from "react";
import { Brain, Lock, User, ArrowRight, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { handleSignUp, handleLogin, fetchProfile, type Profile } from "../lib/api";
import { useLang } from "../lib/i18n";
import { TurnstileWidget } from "./turnstile-widget";

export function AuthScreen({ onAuthed }: { onAuthed: (profile: Profile | null) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
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

    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }

    if (mode === "signup" && !captchaToken) {
      setError("Please complete the human verification.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const profile = await handleSignUp(username.trim(), password, captchaToken);
        setSuccess(true);
        setTimeout(() => onAuthed(profile), 1200);
      } else {
        // 1. Authenticate (username -> username@neurobics.local under the hood).
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
    } catch (err: any) {
      console.error("Auth error during sign in:", err);
      const msg = err?.message ?? "Something went wrong.";
      // Show the styled DB-constraint block only when a name is genuinely taken.
      if (mode === "signup" && msg.toLowerCase().includes("already taken")) {
        setUsernameError(true);
      }
      setError(msg);
      if (mode === "signup") {
        setCaptchaToken("");
        setCaptchaResetKey((key) => key + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError(null);
    setUsernameError(false);
    setSuccess(false);
    setCaptchaToken("");
    setCaptchaResetKey((key) => key + 1);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 text-slate-100 relative overflow-hidden"
      style={{ fontFamily: "'Exo 2', sans-serif", background: "#050A18" }}
    >
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute rounded-full" style={{ top: "-10%", left: "20%", width: 600, height: 600, background: "radial-gradient(circle, rgba(0,212,255,0.10) 0%, transparent 70%)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-15%", right: "10%", width: 500, height: 500, background: "radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 70%)" }} />
        {/* Extra red glow when error */}
        {usernameError && (
          <div className="absolute rounded-full transition-opacity duration-500" style={{ top: "30%", left: "30%", width: 400, height: 400, background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)" }} />
        )}
      </div>

      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-8 transition-all duration-300"
        style={{
          background: "rgba(13,20,45,0.75)",
          border: usernameError ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(0,212,255,0.16)",
          backdropFilter: "blur(18px)",
          boxShadow: usernameError
            ? "0 8px 60px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.15)"
            : success
            ? "0 8px 60px rgba(0,0,0,0.5), 0 0 40px rgba(16,185,129,0.2)"
            : "0 8px 60px rgba(0,0,0,0.5)",
          transition: "box-shadow 0.4s ease, border-color 0.4s ease",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{ background: "linear-gradient(135deg, #00D4FF, #7C3AED)", boxShadow: "0 0 26px rgba(0,212,255,0.4)" }}
          >
            <Brain size={22} className="text-white" />
          </div>
          <div className="text-lg font-bold tracking-[0.22em] text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            NEUROBICS
          </div>
          <div className="text-xs text-slate-500 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {t.auth_tagline}
          </div>
        </div>

        {/* Success state overlay */}
        {success && (
          <div
            className="mb-5 rounded-xl p-4 flex flex-col items-center gap-2 text-center"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", boxShadow: "0 0 20px rgba(16,185,129,0.15)" }}
          >
            <CheckCircle2 size={22} className="text-emerald-400" />
            <div className="text-xs font-bold tracking-wider text-emerald-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              ACCOUNT CREATED
            </div>
            <div className="text-[10px] text-emerald-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Welcome, {username}. Initializing neural profile…
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3.5">
          {/* Username field */}
          <div
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-300"
            style={{
              background: usernameError ? "rgba(239,68,68,0.08)" : "rgba(0,0,0,0.3)",
              border: usernameError ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(0,212,255,0.14)",
              boxShadow: usernameError ? "0 0 16px rgba(239,68,68,0.25), inset 0 0 8px rgba(239,68,68,0.05)" : "none",
            }}
          >
            <span style={{ color: usernameError ? "#F87171" : "#64748b" }}>
              <User size={15} />
            </span>
            <input
              type="text"
              placeholder={t.username_label}
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              autoComplete="username"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-600"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: usernameError ? "#F87171" : "white",
              }}
            />
            {usernameError && (
              <AlertTriangle size={14} className="text-red-400 shrink-0" style={{ filter: "drop-shadow(0 0 4px rgba(239,68,68,0.8))" }} />
            )}
          </div>

          {/* Username error block */}
          {usernameError && (
            <div
              className="rounded-lg px-3 py-2.5 space-y-1"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 0 12px rgba(239,68,68,0.1)" }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F43F5E" }}>
                  ✕ DB_CONSTRAINT_VIOLATION
                </span>
              </div>
              <div className="text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#FCA5A5" }}>
                ERROR: Username already taken. Please choose another.
              </div>
              <div className="text-[9px] text-red-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                UNIQUE constraint failed: profiles.username
              </div>
            </div>
          )}

          {/* Password field */}
          <div
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,255,0.14)" }}
          >
            <span className="text-slate-500"><Lock size={15} /></span>
            <input
              type="password"
              placeholder={t.password_label}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-slate-600"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>

          {mode === "signup" && (
            <TurnstileWidget
              onToken={setCaptchaToken}
              resetKey={captchaResetKey}
            />
          )}

          {/* General error (non-username) */}
          {error && !usernameError && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || success || (mode === "signup" && !captchaToken)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 tracking-wider transition-all duration-200 disabled:opacity-60"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: "linear-gradient(135deg, #00D4FF, #7C3AED)",
              color: "white",
              boxShadow: "0 0 22px rgba(0,212,255,0.3)",
            }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {mode === "login" ? t.sign_in.toUpperCase() : t.sign_up.toUpperCase()}
          </button>
        </form>

        <div className="text-center mt-5 text-xs text-slate-500">
          {mode === "login" ? t.no_account : t.have_account}{" "}
          <button onClick={switchMode} className="text-[#00D4FF] hover:underline" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {mode === "login" ? t.sign_up : t.sign_in}
          </button>
        </div>
      </div>
    </div>
  );
}
