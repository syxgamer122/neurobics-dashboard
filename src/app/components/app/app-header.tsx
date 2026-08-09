import { Activity, Brain, LogOut } from "lucide-react";
import type { Profile } from "../../lib/api";
import type { Lang, Translation } from "../../lib/i18n";
import { APP_VERSION_LABEL } from "../../lib/version";
import { ThemeToggle } from "../theme-toggle";

export function AppHeader({
  profile,
  lang,
  t,
  onToggleLanguage,
  onLogout,
}: {
  profile: Profile;
  lang: Lang;
  t: Translation;
  onToggleLanguage: () => void;
  onLogout: () => void;
}) {
  return (
    <nav
      className="relative z-10 flex items-center justify-between gap-2 px-3 sm:px-6 md:px-8 py-3 sm:py-4 bg-background/50 backdrop-blur-md border-b border-border"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
      }}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div
          className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #00D4FF, #7C3AED)",
            boxShadow: "0 0 20px rgba(0,212,255,0.4)",
          }}
        >
          <Brain size={17} className="text-white" />
        </div>
        <span className="hidden sm:inline text-lg font-bold tracking-[0.22em] text-white font-mono">
          MINDGEM
        </span>
        <span className="inline text-sm font-bold tracking-[0.14em] text-white font-mono sm:hidden">
          MG
        </span>
        <span className="hidden sm:inline text-xs rounded px-2 py-0.5 tracking-widest ml-1 font-mono bg-neuro-cyan/10 text-neuro-cyan border border-neuro-cyan/20">
          {APP_VERSION_LABEL}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 md:gap-6">
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
          <Activity size={12} className="text-neuro-cyan" />
          <span>{t.league}</span>
        </div>
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-neuro-panel border border-neuro-cyan/10">
          <div
            className="w-8 h-8 shrink-0 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold uppercase font-mono"
            style={{
              background: profile.avatar_url
                ? "#0B1228"
                : "linear-gradient(135deg, #A855F7, #7C3AED)",
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              profile.username.slice(0, 2)
            )}
          </div>
          <div className="hidden sm:block min-w-0">
            <div className="text-xs font-semibold text-white truncate max-w-[9rem]">
              {profile.username}
            </div>
            <div className="text-xs text-slate-500">
              {profile.synapse_streak} {t.day_streak}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleLanguage}
          title="Switch language"
          aria-label="Switch language"
          className="h-10 min-w-10 sm:h-9 px-2.5 sm:px-3 rounded-xl flex items-center justify-center text-xs font-bold tracking-wider transition-all duration-150 hover:brightness-125 bg-neuro-panel border border-neuro-cyan/20 text-neuro-cyan"
        >
          {lang === "vi" ? "EN" : "VI"}
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          aria-label={t.sign_out}
          className="h-10 w-10 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center text-neuro-muted hover:text-foreground transition-colors bg-neuro-panel border border-neuro-cyan/10"
        >
          <LogOut size={15} />
        </button>
      </div>
    </nav>
  );
}
