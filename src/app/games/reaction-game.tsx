import { useState, useEffect, useCallback, useRef } from "react";
import { Activity, CheckCircle, Clock, Loader2, RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";
import type { ReactionTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Reaction Time Game ─────────────────────────────────────────────────────

export function ReactionTimeGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: ReactionTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  // 10 lan: median on dinh hon 5 lan, giam nhieu do 1 mau le.
  const TOTAL_TRIALS = 10;

  type ReactionPhase = "idle" | "waiting" | "ready" | "result" | "done";

  const [phase, setPhase] = useState<ReactionPhase>("idle");
  const [rts, setRts] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [currentRt, setCurrentRt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const readyAtRef = useRef(0);
  const falseStartsRef = useRef(0);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }

    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const scheduleTrial = useCallback(() => {
    clearTimers();
    setPhase("waiting");
    setCurrentRt(null);
    setMessage(t.rx_wait);

    const delay = 1500 + Math.random() * 2500;

    waitTimerRef.current = setTimeout(() => {
      readyAtRef.current = performance.now();
      setPhase("ready");
      setMessage(t.rx_now);
    }, delay);
  }, [clearTimers, t]);

  const startGame = () => {
    onPlayStart?.();
    clearTimers();
    setRts([]);
    setFalseStarts(0);
    falseStartsRef.current = 0;
    setCurrentRt(null);
    scheduleTrial();
  };

  const finishGame = async (completedRts: number[]) => {
    clearTimers();
    setPhase("done");
    setSaving(true);

    try {
      await onComplete({
        timeMs: completedRts.reduce((sum, rt) => sum + rt, 0),
        rts: completedRts,
        falseStarts: falseStartsRef.current,
      });
    } catch (err) {
      logError("Reaction completion: onComplete failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handlePadClick = () => {
    if (phase === "waiting") {
      if (waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        waitTimerRef.current = null;
      }

      const newFalseStarts = falseStartsRef.current + 1;
      falseStartsRef.current = newFalseStarts;
      setFalseStarts(newFalseStarts);
      setPhase("result");
      setMessage(t.rx_too_soon_msg);

      nextTimerRef.current = setTimeout(scheduleTrial, 900);
      return;
    }

    if (phase !== "ready") return;

    const reactionMs = Math.max(
      1,
      Math.round(performance.now() - readyAtRef.current),
    );

    const completedRts = [...rts, reactionMs];

    setRts(completedRts);
    setCurrentRt(reactionMs);
    setPhase("result");
    setMessage(`${reactionMs} ms`);

    if (completedRts.length >= TOTAL_TRIALS) {
      nextTimerRef.current = setTimeout(() => {
        finishGame(completedRts);
      }, 800);
    } else {
      nextTimerRef.current = setTimeout(scheduleTrial, 1000);
    }
  };

  const resetGame = () => {
    clearTimers();
    setPhase("idle");
    setRts([]);
    setFalseStarts(0);
    falseStartsRef.current = 0;
    setCurrentRt(null);
    setMessage("");
  };

  const average =
    rts.length > 0
      ? Math.round(rts.reduce((sum, rt) => sum + rt, 0) / rts.length)
      : 0;

  const padBackground =
    phase === "ready"
      ? "rgba(var(--neuro-green-rgb),0.85)"
      : phase === "result" && currentRt === null
        ? "rgba(var(--neuro-red-rgb),0.35)"
        : "rgba(var(--neuro-panel-rgb),0.8)";

  const padBorder =
    phase === "ready"
      ? "1px solid rgba(var(--neuro-green-rgb),1)"
      : phase === "result" && currentRt === null
        ? "1px solid rgba(var(--neuro-red-rgb),0.8)"
        : "1px solid rgba(var(--neuro-green-rgb),0.25)";

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(var(--neuro-panel-rgb),0.62)",
        border: "1px solid rgba(var(--neuro-green-rgb),0.2)",
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{
              color: "#10B981",
            }}
          >
            {t.rx_tag}
          </div>

          <div className="text-base font-bold text-foreground">
            Reaction Time
          </div>
        </div>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(var(--neuro-green-rgb),0.18)",
            color: "#10B981",
            border: "1px solid rgba(var(--neuro-green-rgb),0.28)",
          }}
        >
          <Activity size={17} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.rx_trial}</div>
          <div className="text-lg font-bold text-foreground">
            {Math.min(rts.length + 1, TOTAL_TRIALS)}/{TOTAL_TRIALS}
          </div>
        </div>

        <div className="text-center">
          <div className="text-xs text-slate-500">{t.rx_average}</div>
          <div className="text-lg font-bold text-neuro-green">
            {average || "--"} ms
          </div>
        </div>

        <div className="text-center">
          <div className="text-xs text-slate-500">{t.rx_too_soon}</div>
          <div className="text-lg font-bold text-[#F43F5E]">{falseStarts}</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500 text-center">
        {t.rx_false_start_note}
      </div>

      {phase === "idle" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 280 }}
        >
          <Clock size={46} className="text-neuro-green mb-5" />

          <p className="text-sm text-slate-400 text-center leading-relaxed">
            {t.rx_intro_1}
            <br />
            {t.rx_intro_2}
          </p>

          <button
            onClick={startGame}
            className="mt-6 px-8 py-3 rounded-xl text-sm font-bold tracking-widest hover:scale-105 transition-all font-mono"
            style={{
              background: "rgba(var(--neuro-green-rgb),0.15)",
              color: "#10B981",
              border: "1px solid rgba(var(--neuro-green-rgb),0.4)",
            }}
          >
            {t.rx_start}
          </button>
        </div>
      ) : phase === "done" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 280 }}
        >
          <CheckCircle size={48} className="text-emerald-400 mb-4" />

          <div className="text-lg font-bold text-foreground">
            {t.rx_complete}
          </div>

          <div className="mt-2 text-4xl font-bold text-neuro-green">
            {average} ms
          </div>

          <div className="mt-1 text-xs text-slate-500">{t.rx_avg_label}</div>
        </div>
      ) : (
        <button
          onClick={handlePadClick}
          className={`mt-6 rounded-2xl flex flex-col items-center justify-center transition-all ${
            phase === "ready" ? "animate-pulse" : ""
          }`}
          style={{
            minHeight: 280,
            background: padBackground,
            border: padBorder,
            boxShadow:
              phase === "ready"
                ? "0 0 40px rgba(var(--neuro-green-rgb),0.45)"
                : "none",
          }}
        >
          <div className="text-2xl font-bold text-foreground">{message}</div>

          {phase === "waiting" && (
            <div className="mt-3 text-xs text-slate-500">{t.rx_dont_press}</div>
          )}
        </button>
      )}

      {saving && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          {t.rx_saving}
        </div>
      )}

      {phase !== "idle" && (
        <button
          disabled={saving}
          onClick={resetGame}
          className="mt-5 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2"
          style={{
            background: "rgba(var(--neuro-green-rgb),0.1)",
            color: "#10B981",
            border: "1px solid rgba(var(--neuro-green-rgb),0.25)",
          }}
        >
          <RefreshCw size={12} />
          {t.rx_restart}
        </button>
      )}
    </div>
  );
}
