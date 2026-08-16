import { TrendingUp } from "lucide-react";

import { useLang } from "../../lib/i18n";
import { RATING_MAX } from "../../lib/provisional-score";
import { GlassCard } from "../ui/glass-card";
import { Label } from "../ui/label";

/** Chi so nhan thuc tong hop (trung binh cac truc dang hoat dong). */
export function CognitiveIndexCard({ index }: { index: number }) {
  const { t } = useLang();

  return (
    <GlassCard accent="#00D4FF" className="p-6 flex-1">
      <Label color="#00D4FF">{t.cognitive_index}</Label>
      <div className="flex items-baseline gap-2 mt-3 mb-1">
        <span
          className="text-7xl font-bold text-foreground"
          style={{
            textShadow: "0 0 40px rgba(var(--neuro-cyan-rgb),0.55)",
          }}
        >
          {index}
        </span>
        <span className="text-lg text-slate-500">/ {RATING_MAX}</span>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={13} className="text-emerald-400" />
        <span className="text-sm text-emerald-400">{t.balanced_avg}</span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${(index / RATING_MAX) * 100}%`,
            background: "linear-gradient(90deg, #00D4FF, #A855F7)",
            boxShadow: "0 0 14px rgba(var(--neuro-cyan-rgb),0.6)",
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs text-slate-400">{t.apprentice}</span>
        <span className="text-xs text-slate-400">{t.mastermind}</span>
      </div>
    </GlassCard>
  );
}
