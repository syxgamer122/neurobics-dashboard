import { Brain, Flame } from "lucide-react";

import { useLang } from "../../lib/i18n";
import { GlassCard } from "../ui/glass-card";
import { Label } from "../ui/label";
import { StatMini } from "../ui/stat-mini";

export type StreakCardProps = {
  streak: number;
  sessionsThisMonth: number;
  xpToday: number;
};

/** Chuoi ngay lien tiep + 3 so lieu nhanh (streak / thang nay / XP hom nay). */
export function StreakCard({ streak, sessionsThisMonth, xpToday }: StreakCardProps) {
  const { t } = useLang();

  return (
    <GlassCard accent="#F59E0B" className="p-6">
      <Label color="#F59E0B">{t.synapse_streak}</Label>
      <div className="flex items-center gap-5 mt-4">
        <div className="relative shrink-0">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center streak-glow"
            style={{
              background: "linear-gradient(135deg, #F59E0B, #EF4444)",
            }}
          >
            <Brain size={34} className="text-white" />
          </div>
          <div
            className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: "#EF4444",
              boxShadow: "0 0 12px rgba(239,68,68,0.5)",
            }}
          >
            <Flame size={13} className="text-white" />
          </div>
        </div>
        <div>
          <div
            className="text-6xl font-bold text-white leading-none"
            style={{
              textShadow: "0 0 24px rgba(245,158,11,0.5)",
            }}
          >
            {streak}
          </div>
          <div className="text-sm text-slate-400 mt-1.5">
            {t.day_streak}
          </div>
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="w-6 h-2 rounded-full"
                style={
                  i <
                  (streak > 0
                    ? ((streak - 1) % 7) + 1
                    : 0)
                    ? {
                        background:
                          "linear-gradient(90deg, #F59E0B, #EF4444)",
                        boxShadow: "0 0 6px rgba(245,158,11,0.5)",
                      }
                    : { background: "rgba(255,255,255,0.07)" }
                }
              />
            ))}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {t.streak_week_label}
            {" · "}
            {t.streak_tz_note}
          </div>
        </div>
      </div>
      <div
        className="grid grid-cols-3 gap-3 mt-5 pt-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <StatMini
          label={t.synapse_streak}
          value={String(streak)}
          unit={t.days}
          color="#F59E0B"
        />
        <StatMini
          label={t.this_month}
          value={String(sessionsThisMonth)}
          unit={t.sessions}
          color="#A855F7"
        />
        <StatMini
          label={t.xp_today}
          value={String(xpToday)}
          unit={t.pts}
          color="#00D4FF"
        />
      </div>
    </GlassCard>
  );
}
