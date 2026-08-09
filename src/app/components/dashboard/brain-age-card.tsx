import { useLang } from "../../lib/i18n";
import { calcBrainAge } from "../../lib/scoring";
import { GlassCard } from "../ui/glass-card";
import { Label } from "../ui/label";

export type BrainAgeState = ReturnType<typeof calcBrainAge>;

export type BrainAgeCardProps = {
  brainAge: BrainAgeState;
  birthYearInput: string;
  onBirthYearChange: (value: string) => void;
  onSubmit: () => void;
  saving: boolean;
};

/**
 * Tuoi nao chi hien khi co y nghia: can nam sinh that va du so van de xep hang.
 * Thieu mot trong hai thi card chuyen sang trang thai nhap tuoi / hieu chuan.
 */
export function BrainAgeCard({
  brainAge,
  birthYearInput,
  onBirthYearChange,
  onSubmit,
  saving,
}: BrainAgeCardProps) {
  const { t } = useLang();

  return (
    <GlassCard accent="#A855F7" className="p-6">
      <Label color="#A855F7">{t.brain_age}</Label>

      {/* Brain age is only shown once it can actually mean something:
      we need the player's real age to shift from, and enough rounds
      to rank them. Anything less would be a decorative number. */}
      {brainAge.status === "needs_age" ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="text-xs text-slate-400 leading-relaxed">
            {t.brain_age_needs_age}
          </div>
          <div className="flex gap-2">
            <input
              value={birthYearInput}
              onChange={(e) =>
                onBirthYearChange(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              inputMode="numeric"
              placeholder={t.birth_year_placeholder}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(var(--neuro-purple-rgb),0.25)",
              }}
            />
            <button
              onClick={onSubmit}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold tracking-wider shrink-0 transition-all duration-150 hover:brightness-125 disabled:opacity-60"
              style={{
                background: "rgba(var(--neuro-purple-rgb),0.18)",
                color: "#A855F7",
                border: "1px solid rgba(var(--neuro-purple-rgb),0.4)",
              }}
            >
              {saving ? t.saving : t.save_btn}
            </button>
          </div>
        </div>
      ) : brainAge.status === "calibrating" ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="text-xs text-slate-400 leading-relaxed">
            {t.brain_age_calibrating(
              brainAge.roundsPlayed,
              brainAge.roundsNeeded,
            )}
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(brainAge.roundsPlayed / brainAge.roundsNeeded) * 100}%`,
                background: "linear-gradient(90deg, #A855F7, #00D4FF)",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-5 mt-4">
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <defs>
                <linearGradient id="ageGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#A855F7" />
                  <stop offset="100%" stopColor="#00D4FF" />
                </linearGradient>
              </defs>
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke="rgba(var(--neuro-purple-rgb),0.12)"
                strokeWidth="7"
              />
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke="url(#ageGrad)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36 * brainAge.ringPct} ${2 * Math.PI * 36 * (1 - brainAge.ringPct)}`}
                strokeDashoffset={2 * Math.PI * 36 * 0.25}
                style={{
                  filter:
                    "drop-shadow(0 0 8px rgba(var(--neuro-purple-rgb),0.7))",
                  transition: "stroke-dasharray 0.8s ease",
                }}
              />
              <text
                x="44"
                y="49"
                textAnchor="middle"
                fill="white"
                fontSize="20"
                fontWeight="700"
                className="font-mono"
              >
                {brainAge.age}
              </text>
            </svg>
          </div>
          <div>
            <div className="text-4xl font-bold text-white">
              {brainAge.age} {t.yrs_unit}
            </div>
            <div className="text-xs text-slate-400 mt-1.5">
              {t.brain_age_percentile(
                Math.round(brainAge.percentile * 100),
                brainAge.realAge,
              )}
            </div>
            <div
              className="text-xs mt-1 font-semibold"
              style={{
                color:
                  brainAge.delta === 0
                    ? "#94A3B8"
                    : brainAge.delta > 0
                      ? "#10B981"
                      : "#F43F5E",
              }}
            >
              {/* delta === 0 truoc day roi vao nhanh ">= 0" va hien
                  "Tre hon 0 tuoi" — vo nghia. Tach nhanh rieng. */}
              {brainAge.delta === 0
                ? t.yrs_same
                : brainAge.delta > 0
                  ? t.yrs_younger(brainAge.delta)
                  : t.yrs_older(Math.abs(brainAge.delta))}
            </div>
            {brainAge.provisional && (
              <div className="text-xs text-slate-500 mt-1.5 leading-snug">
                {t.brain_age_provisional}
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
