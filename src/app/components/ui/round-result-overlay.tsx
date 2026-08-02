import { Clock, Star, Zap } from "lucide-react";
import { useLang } from "../../lib/i18n";
import { RATING_MAX } from "../../lib/scoring";
import type { RoundGame } from "../../lib/api";
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
  // Dung chung kieu voi api.ts: them game moi la tu dong theo, khong con
  // canh mot ben biet mot ben khong.
  game: RoundGame;
  timeMs: number;
  /** Only the axes this game actually measures. */
  rows: RoundAxisRow[];
  /** Best axis earned this round, for the headline badge. */
  headline: number;
  label: string; // e.g. "5×5 Classic" or "Expert"
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
  const GAME_META: Record<
    RoundResult["game"],
    { title: string; accent: string }
  > = {
    schulte: { title: "SCHULTE TABLE", accent: "#A855F7" },
    sudoku: { title: "SUDOKU", accent: "#00D4FF" },
    stroop: { title: "STROOP TEST", accent: "#EAB308" },
    reaction: { title: "REACTION TIME", accent: "#10B981" },
    memory: { title: "MEMORY MATRIX", accent: "#F43F5E" },
    nback: { title: "N-BACK", accent: "#8B5CF6" },
    math: { title: "MATH SPRINT", accent: "#38BDF8" },
  };
  const meta = GAME_META[result.game] ?? GAME_META.sudoku;
  const accent = meta.accent;
  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const cs = Math.floor((ms % 1000) / 10);
    return m > 0
      ? `${m}:${String(s % 60).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
      : `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,10,24,0.88)", backdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.4444))" }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5"
        style={{
          background: "rgba(13,20,45,0.95)",
          border: `1px solid ${accent}33`,
          boxShadow: `0 0 60px ${accent}22, 0 8px 48px rgba(0,0,0,0.6)`}}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div
              className="text-xs tracking-[0.25em] mb-1 font-mono"
              style={{
                
                color: accent}}
            >
              {meta.title} · {t.round_complete}
            </div>
            <div className="text-xl font-bold text-white">{result.label}</div>
          </div>
          <div
            className="flex flex-col items-end gap-0.5 px-2.5 py-1.5 rounded-lg shrink-0"
            style={{
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.25)"}}
          >
            <span
              className="text-[8px] tracking-[0.15em] font-mono"
              style={{
                
                color: "rgba(245,158,11,0.7)"}}
            >
              {t.round_score_label}
            </span>
            <div className="flex items-center gap-1.5">
              <Star size={11} style={{ color: "#F59E0B" }} />
              <span
                className="text-xs font-bold"
                style={{
                  
                  color: "#F59E0B"}}
              >
                {result.headline} / {RATING_MAX}
              </span>
            </div>
          </div>
        </div>

        {/* Time */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)"}}
        >
          <Clock size={14} style={{ color: accent }} />
          <span
            className="text-xs text-slate-500"
          >
            TIME
          </span>
          <span
            className="ml-auto text-xl font-bold tabular-nums font-mono"
            style={{  color: accent }}
          >
            {fmtTime(result.timeMs)}
          </span>
        </div>

        {/* Domain scores */}
        <div className="flex flex-col gap-3">
          <div
            className="text-xs text-slate-400 tracking-widest font-mono"
          >
            {t.current_rating_label} · {t.domains_this_round}
          </div>
          {/* Only the axes this game measures appear here, each with its own
              round score — so it's visible that they no longer move in lockstep. */}
          {result.rows.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <div className="flex justify-between items-baseline">
                <span
                  className="text-xs font-bold"
                  style={{
                    
                    color: s.color}}
                >
                  {s.label.toUpperCase()}
                </span>
                <span
                  className="text-sm font-bold tabular-nums text-white font-mono"
                >
                  {s.next} / {RATING_MAX}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(s.next / RATING_MAX) * 100}%`,
                    background: s.color,
                    boxShadow: `0 0 8px ${s.color}88`,
                    transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)"}}
                />
              </div>
              <div
                className="text-xs text-slate-400"
              >
                {t.round_axis_detail(
                  s.round,
                  s.next > s.prev ? s.next - s.prev : 0,
                )}
              </div>
            </div>
          ))}
        </div>

        {/* XP earned */}
        {result.xpAwarded != null && result.xpAwarded > 0 && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: result.leveledUp
                ? "rgba(245,158,11,0.12)"
                : "rgba(16,185,129,0.10)",
              border: `1px solid ${result.leveledUp ? "rgba(245,158,11,0.35)" : "rgba(16,185,129,0.25)"}`}}
          >
            <Zap
              size={14}
              style={{ color: result.leveledUp ? "#F59E0B" : "#10B981" }}
            />
            <span
              className="text-xs text-slate-400"
            >
              {result.leveledUp ? t.level_up : t.xp_earned}
            </span>
            <span
              className="ml-auto text-lg font-bold tabular-nums font-mono"
              style={{
                
                color: result.leveledUp ? "#F59E0B" : "#10B981"}}
            >
              +{result.xpAwarded} XP
            </span>
            {result.xpLevel != null && (
              <span
                className="text-xs px-2 py-1 rounded-md"
                style={{
                  
                  background: "rgba(255,255,255,0.06)",
                  color: "#94A3B8"}}
              >
                Lv.{result.xpLevel}
              </span>
            )}
          </div>
        )}

        {/* Note */}
        <div
          className="text-xs text-slate-400 text-center"
        >
          {t.score_note}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold tracking-widest transition-all duration-150 hover:brightness-125 font-mono"
          style={{
            
            background: `${accent}20`,
            color: accent,
            border: `1px solid ${accent}44`,
            boxShadow: `0 0 20px ${accent}18`}}
        >
          {t.continue_btn}
        </button>
      </div>
    </div>
  );
}


