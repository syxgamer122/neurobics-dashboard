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
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-8 py-3.5 bg-white/85 dark:bg-slate-950/75 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/8 shadow-sm transition-all"
      style={{
        paddingTop: "max(0.85rem, env(safe-area-inset-top))",
      }}
    >
      {/* Brand logo */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center shadow-md shadow-cyan-500/20"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
          }}
        >
          <Brain size={20} className="text-white" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-extrabold tracking-wider font-mono bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 dark:from-cyan-400 dark:to-purple-400 bg-clip-text text-transparent">
              MINDGEM
            </span>
            <span className="text-[10px] rounded-md px-1.5 py-0.5 tracking-wider font-mono font-bold bg-cyan-100/80 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/20">
              {APP_VERSION_LABEL}
            </span>
          </div>
          <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Cognitive Training & Intelligence Platform
          </span>
        </div>
      </div>

      {/* User profile and quick settings */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* League status */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300">
          <Activity
            size={13}
            className="text-cyan-600 dark:text-cyan-400 animate-pulse"
          />
          <span className="font-medium">{t.league}</span>
        </div>

        {/* Profile Pill */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 shadow-sm">
          <div
            className="w-7 h-7 shrink-0 rounded-lg overflow-hidden flex items-center justify-center text-xs font-bold text-white shadow-inner font-mono"
            style={{
              background: profile.avatar_url
                ? "transparent"
                : "linear-gradient(135deg, #8b5cf6, #ec4899)",
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              profile.username.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="hidden sm:block min-w-0 pr-1">
            <div className="text-xs font-bold text-foreground truncate max-w-[8.5rem]">
              {profile.username}
            </div>
          </div>
        </div>

        {/* Language switch */}
        <button
          type="button"
          onClick={onToggleLanguage}
          title="Đổi ngôn ngữ / Switch language"
          aria-label="Switch language"
          className="h-9 px-3 rounded-xl flex items-center justify-center text-xs font-bold font-mono tracking-wider transition-all duration-200 hover:scale-105 bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 text-cyan-700 dark:text-cyan-400 hover:border-cyan-500/40 cursor-pointer"
        >
          {lang === "vi" ? "VI" : "EN"}
        </button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          title="Đăng xuất"
          aria-label={t.sign_out}
          className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-200 bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 cursor-pointer"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
