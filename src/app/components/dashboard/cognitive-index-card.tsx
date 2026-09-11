import { Brain, Sparkles, TrendingUp } from "lucide-react";
import { useLang } from "../../lib/i18n";
import { RATING_MAX } from "../../lib/provisional-score";

/** Chi so nhan thuc tong hop (trung binh cac truc dang hoat dong). */
export function CognitiveIndexCard({ index }: { index: number }) {
  const { t } = useLang();
  const percentage = Math.min(
    100,
    Math.max(0, Math.round((index / RATING_MAX) * 100)),
  );

  return (
    <div className="relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-2xl border border-slate-200/80 dark:border-cyan-500/20 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl transition-all">
      {/* Background ambient light */}
      <div
        className="absolute top-0 right-0 w-44 h-44 rounded-full pointer-events-none opacity-50 dark:opacity-100"
        style={{
          background:
            "radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, transparent 70%)",
        }}
      />

      <div>
        {/* Header Label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-100/80 dark:bg-cyan-500/15 border border-cyan-300 dark:border-cyan-500/30 text-cyan-600 dark:text-cyan-400">
              <Brain size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-cyan-700 dark:text-cyan-400">
              {t.cognitive_index}
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 flex items-center gap-1">
            <Sparkles size={11} /> {percentage}% Max
          </span>
        </div>

        {/* Big Score Display */}
        <div className="flex items-baseline gap-2 mt-5 mb-2">
          <span
            className="text-6xl sm:text-7xl font-extrabold text-foreground tracking-tight font-mono"
            style={{
              textShadow: "0 0 30px rgba(6, 182, 212, 0.25)",
            }}
          >
            {index}
          </span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 font-mono">
            / {RATING_MAX}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <TrendingUp
            size={14}
            className="text-emerald-600 dark:text-emerald-400"
          />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t.balanced_avg}
          </span>
        </div>
      </div>

      {/* Progress Bar & Scale */}
      <div>
        <div className="h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-white/5">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${percentage}%`,
              background: "linear-gradient(90deg, #06b6d4, #8b5cf6, #ec4899)",
              boxShadow: "0 0 12px rgba(6, 182, 212, 0.5)",
            }}
          />
        </div>
        <div className="flex justify-between items-center mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>0</span>
          <span>{RATING_MAX / 2}</span>
          <span>{RATING_MAX} MAX</span>
        </div>
      </div>
    </div>
  );
}
