import { useLang } from "../../lib/i18n";
import { getLevelProgress, getLevelTitle } from "../../lib/xp";
import { GlassCard } from "../ui/glass-card";
import { Label } from "../ui/label";

export type LevelProgress = ReturnType<typeof getLevelProgress>;

export type LevelCardProps = {
  levelProgress: LevelProgress;
  levelColor: string;
  totalXp: number;
};

/** Cap do, danh hieu va thanh tien do XP trong cap hien tai. */
export function LevelCard({ levelProgress, levelColor, totalXp }: LevelCardProps) {
  const { t } = useLang();

  return (
    <GlassCard accent={levelColor} className="p-6">
      <div className="flex items-center gap-5">
        <div
          className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${levelColor}, ${levelColor}88)`,
            boxShadow: `0 0 40px ${levelColor}44`,
          }}
        >
          <span className="text-3xl font-bold text-white leading-none">
            {levelProgress.level}
          </span>
          <span className="text-[8px] tracking-widest text-white/70 mt-0.5 font-mono">
            LV
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <Label color={levelColor}>
            {getLevelTitle(levelProgress.level)}
          </Label>
          <div className="flex items-baseline gap-2 mt-1 mb-2">
            <span className="text-2xl font-bold text-white">
              {levelProgress.xpIntoLevel}
            </span>
            <span className="text-sm text-slate-500">
              / {levelProgress.xpNeeded} XP
            </span>
            <span className="ml-auto text-xs text-slate-500">
              {t.total_xp_label}:{" "}
              {totalXp.toLocaleString()}
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, levelProgress.progress * 100)}%`,
                background: `linear-gradient(90deg, ${levelColor}, ${levelColor}aa)`,
                boxShadow: `0 0 10px ${levelColor}66`,
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
