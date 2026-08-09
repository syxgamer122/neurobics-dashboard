import { useEffect, useRef } from "react";
import {
  Clock,
  Star,
  Zap,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { useLang } from "../../lib/i18n";
import { RATING_MAX } from "../../lib/scoring";
import type { RoundGame } from "../../lib/api";
import { GAME_BY_ID } from "../../lib/game-registry";

export type RoundAxisRow = {
  label: string;
  color: string;
  /** What this round alone scored on the axis. */
  round: number;
  /** Stored rating before the round. */
  prev: number;
  /** Stored rating after the round. */
  next: number;
};

export type RoundResult = {
  game: RoundGame;
  timeMs: number;
  rows: RoundAxisRow[];
  /** Average of active axes this round. */
  headline: number;
  label: string;
  xpAwarded?: number;
  xpLevel?: number;
  leveledUp?: boolean;
};

export function RoundResultOverlay({
  result,
  onClose,
}: {
  result: RoundResult;
  onClose: () => void;
}) {
  const { t } = useLang();
  const meta = GAME_BY_ID[result.game];
  const accent = meta.accent;
  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const cs = Math.floor((ms % 1000) / 10);
    return m > 0
      ? `${m}:${String(s % 60).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
      : `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  // A11Y: day la overlay ket qua dung chung cho CA 11 game. Truoc day no mo ra
  // ma trinh doc man hinh khong doc gi het: dialog khong co ten, khong co mo ta,
  // va khong he nhan focus. Nguoi dung screen reader choi xong mot van nhung
  // khong biet minh duoc bao nhieu diem.
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  // Esc de dong — hanh vi tieu chuan cua dialog, truoc day thieu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Gom ket qua thanh MOT cau, thay vi de screen reader doc bo tung o mot.
  const srSummary = [
    `${meta.title} · ${t.round_complete}`,
    `${t.round_score_label}: ${result.headline}/${RATING_MAX}`,
    fmtTime(result.timeMs),
    ...result.rows.map(
      (s) => `${s.label}: ${s.round}/${RATING_MAX} (${s.prev} → ${s.next})`,
    ),
    result.xpAwarded != null && result.xpAwarded > 0
      ? `${result.leveledUp ? t.level_up : t.xp_earned}: +${result.xpAwarded} XP`
      : "",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4"
      style={{
        background: "rgba(var(--neuro-ink-rgb),0.88)",
        backdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.4444))",
        // Du cho dock + home indicator neu van hien (mac dinh se an dock khi overlay mo).
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="round-result-title"
      aria-describedby="round-result-summary"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{
          // Gioi han chieu cao viewport — noi dung cuon, nut CONTINUE luon thay.
          maxHeight: "min(92vh, 720px)",
          background: "rgba(var(--neuro-panel-rgb),0.95)",
          border: `1px solid ${accent}33`,
          boxShadow: `0 0 60px ${accent}22, 0 8px 48px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Noi dung cuon */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 flex flex-col gap-4 sm:gap-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                id="round-result-title"
                className="text-xs tracking-[0.25em] mb-1 font-mono"
                style={{ color: accent }}
              >
                {meta.title.toUpperCase()} · {t.round_complete}
              </div>
              {/* Chi danh cho trinh doc man hinh. Dung inline style thay vi class
                  sr-only de khong phu thuoc cau hinh Tailwind. */}
              <p
                id="round-result-summary"
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  margin: -1,
                  padding: 0,
                  overflow: "hidden",
                  clipPath: "inset(50%)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              >
                {srSummary}
              </p>
              <div className="text-xl font-bold text-white truncate">
                {result.label}
              </div>
            </div>
          </div>

          {/* PRIMARY: diem VAN NAY */}
          <div
            className="flex flex-col items-center gap-1 px-4 py-4 rounded-xl"
            style={{
              background: `${accent}14`,
              border: `1px solid ${accent}44`,
              boxShadow: `0 0 28px ${accent}18`,
            }}
          >
            <span
              className="text-xs tracking-[0.2em] font-mono"
              style={{ color: `${accent}cc` }}
            >
              {t.round_score_label}
            </span>
            <div className="flex items-center gap-2">
              <Star size={18} style={{ color: accent }} />
              <span
                className="text-4xl font-bold tabular-nums font-mono"
                style={{ color: accent }}
              >
                {result.headline}
              </span>
              <span className="text-lg text-slate-400 font-mono">
                / {RATING_MAX}
              </span>
            </div>
            <span className="text-xs text-slate-400 text-center">
              {t.round_score_hint}
            </span>
          </div>

          {/* Time */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Clock size={14} style={{ color: accent }} />
            <span className="text-xs text-slate-500">TIME</span>
            <span
              className="ml-auto text-xl font-bold tabular-nums font-mono"
              style={{ color: accent }}
            >
              {fmtTime(result.timeMs)}
            </span>
          </div>

          {/* Per-axis */}
          <div className="flex flex-col gap-3">
            <div className="text-xs text-slate-400 tracking-widest font-mono">
              {t.domains_this_round}
            </div>
            {result.rows.map((s) => {
              const delta = s.next - s.prev;
              const DeltaIcon =
                delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
              const deltaColor =
                delta > 0 ? "#10B981" : delta < 0 ? "#F43F5E" : "#94A3B8";
              return (
                <div key={s.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline gap-2">
                    <span
                      className="text-xs font-bold"
                      style={{ color: s.color }}
                    >
                      {s.label.toUpperCase()}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-white font-mono">
                      {s.round}
                      <span className="text-slate-500 font-normal">
                        {" "}
                        / {RATING_MAX}
                      </span>
                    </span>
                  </div>
                  <div
                    className="h-2.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.round / RATING_MAX) * 100}%`,
                        background: s.color,
                        boxShadow: `0 0 8px ${s.color}88`,
                        transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400 font-mono">
                      {t.profile_rating_short}: {s.prev} → {s.next}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 font-mono font-bold"
                      style={{ color: deltaColor }}
                    >
                      <DeltaIcon size={11} />
                      {delta > 0 ? `+${delta}` : delta === 0 ? "0" : `${delta}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {result.xpAwarded != null && result.xpAwarded > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: result.leveledUp
                  ? "rgba(var(--neuro-amber-rgb),0.12)"
                  : "rgba(var(--neuro-green-rgb),0.10)",
                border: `1px solid ${
                  result.leveledUp
                    ? "rgba(var(--neuro-amber-rgb),0.35)"
                    : "rgba(var(--neuro-green-rgb),0.25)"
                }`,
              }}
            >
              <Zap
                size={14}
                style={{ color: result.leveledUp ? "#F59E0B" : "#10B981" }}
              />
              <span className="text-xs text-slate-400">
                {result.leveledUp ? t.level_up : t.xp_earned}
              </span>
              <span
                className="ml-auto text-lg font-bold tabular-nums font-mono"
                style={{
                  color: result.leveledUp ? "#F59E0B" : "#10B981",
                }}
              >
                +{result.xpAwarded} XP
              </span>
              {result.xpLevel != null && (
                <span
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "#94A3B8",
                  }}
                >
                  Lv.{result.xpLevel}
                </span>
              )}
            </div>
          )}

          <div className="text-xs text-slate-400 text-center">
            {t.score_note}
          </div>
        </div>

        {/* Nut CONTINUEghim day — khong bi cuon mat / che boi dock */}
        <div
          className="shrink-0 border-t px-5 py-3 sm:px-6 sm:py-4"
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            background: "rgba(8,14,32,0.96)",
          }}
        >
          <button
            ref={continueRef}
            type="button"
            onClick={onClose}
            className="w-full min-h-12 py-3 rounded-xl text-sm font-bold tracking-widest transition-all duration-150 hover:brightness-125 font-mono"
            style={{
              background: `${accent}20`,
              color: accent,
              border: `1px solid ${accent}44`,
              boxShadow: `0 0 20px ${accent}18`,
            }}
          >
            {t.continue_btn}
          </button>
        </div>
      </div>
    </div>
  );
}
