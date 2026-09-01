import { Trophy, Zap } from "lucide-react";
import { useLang } from "../../lib/i18n";
import { getLevelProgress, getLevelTitle } from "../../lib/xp";

export type LevelProgress = ReturnType<typeof getLevelProgress>;

export type LevelCardProps = {
  levelProgress: LevelProgress;
  levelColor: string;
  totalXp: number;
};

/** Cap do, danh hieu va thanh tien do XP trong cap hien tai. */
export function LevelCard({
  levelProgress,
  levelColor,
  totalXp,
}: LevelCardProps) {
  const { t } = useLang();
  const progressPct = Math.min(100, Math.round(levelProgress.progress * 100));

  return (
    <div className="relative rounded-3xl p-6 sm:p-7 flex flex-col md:flex-row items-stretch md:items-center gap-6 overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl transition-all">
      {/* Background ambient light */}
      <div
        className="absolute bottom-0 right-0 w-48 h-48 rounded-full pointer-events-none opacity-50 dark:opacity-100"
        style={{
          background: `radial-gradient(circle, ${levelColor}15 0%, transparent 70%)`,
        }}
      />

      {/* Level Avatar Badge */}
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-lg relative group"
          style={{
            background: `linear-gradient(135deg, ${levelColor}, ${levelColor}aa)`,
            boxShadow: `0 0 28px ${levelColor}44`,
          }}
        >
          <span className="text-2xl sm:text-3xl font-extrabold text-white leading-none font-mono">
            {levelProgress.level}
          </span>
          <span className="text-[9px] tracking-widest text-white/90 font-bold font-mono uppercase mt-0.5">
            LEVEL
          </span>
        </div>

        <div className="md:hidden flex-1 min-w-0">
          <span
            className="text-xs font-bold uppercase tracking-wider font-mono px-2.5 py-0.5 rounded-full"
            style={{
              background: `${levelColor}18`,
              color: levelColor,
              border: `1px solid ${levelColor}44`,
            }}
          >
            {getLevelTitle(levelProgress.level)}
          </span>
          <div className="text-lg font-bold text-foreground mt-1">
            {totalXp.toLocaleString()}{" "}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              XP
            </span>
          </div>
        </div>
      </div>

      {/* Progress & Details */}
      <div className="flex-1 min-w-0">
        <div className="hidden md:flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold uppercase tracking-wider font-mono px-3 py-1 rounded-full flex items-center gap-1.5"
              style={{
                background: `${levelColor}18`,
                color: levelColor,
                border: `1px solid ${levelColor}44`,
              }}
            >
              <Trophy size={12} />
              {getLevelTitle(levelProgress.level)}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Zap size={13} className="text-amber-500 dark:text-amber-400" />
            {t.total_xp_label}:{" "}
            <strong className="text-foreground">
              {totalXp.toLocaleString()} XP
            </strong>
          </span>
        </div>

        {/* Progress Values */}
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-foreground font-mono">
              {levelProgress.xpIntoLevel.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono">
              / {levelProgress.xpNeeded.toLocaleString()} XP tới Level{" "}
              {levelProgress.level + 1}
            </span>
          </div>
          <span
            className="text-xs font-bold font-mono"
            style={{ color: levelColor }}
          >
            {progressPct}%
          </span>
        </div>

        {/* Level Progress Bar */}
        <div className="h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-white/5">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${levelColor}, ${levelColor}cc)`,
              boxShadow: `0 0 12px ${levelColor}66`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
