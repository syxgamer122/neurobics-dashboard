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
    <div
      className="relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between overflow-hidden shadow-xl"
      style={{
        background:
          "linear-gradient(145deg, rgba(13, 20, 48, 0.8), rgba(8, 14, 32, 0.7))",
        border: "1px solid rgba(6, 182, 212, 0.2)",
        backdropFilter: "blur(20px)",
        boxShadow:
          "0 12px 36px -8px rgba(0, 0, 0, 0.4), 0 0 24px -4px rgba(6, 182, 212, 0.12)",
      }}
    >
      {/* Background ambient light */}
      <div
        className="absolute top-0 right-0 w-44 h-44 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, transparent 70%)",
        }}
      />

      <div>
        {/* Header Label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Brain size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-cyan-400">
              {t.cognitive_index}
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
            <Sparkles size={11} /> {percentage}% Max
          </span>
        </div>

        {/* Big Score Display */}
        <div className="flex items-baseline gap-2 mt-5 mb-2">
          <span
            className="text-6xl sm:text-7xl font-extrabold text-foreground tracking-tight font-mono"
            style={{
              textShadow: "0 0 30px rgba(6, 182, 212, 0.4)",
            }}
          >
            {index}
          </span>
          <span className="text-sm font-semibold text-slate-400 font-mono">
            / {RATING_MAX}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={14} className="text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">
            {t.balanced_avg}
          </span>
        </div>
      </div>

      {/* Progress Bar & Scale */}
      <div>
        <div className="h-2 rounded-full overflow-hidden bg-slate-800/80 p-0.5 border border-white/5">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${percentage}%`,
              background: "linear-gradient(90deg, #06b6d4, #8b5cf6, #ec4899)",
              boxShadow: "0 0 12px rgba(6, 182, 212, 0.5)",
            }}
          />
        </div>
        <div className="flex justify-between items-center mt-2 text-[11px] font-medium text-slate-400">
          <span>{t.apprentice}</span>
          <span className="text-slate-300 font-semibold font-mono">
            {percentage}/100
          </span>
          <span>{t.mastermind}</span>
        </div>
      </div>
    </div>
  );
}
