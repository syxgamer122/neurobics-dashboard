import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Loader2, RefreshCw, Star, Zap } from "lucide-react";
import { useLang } from "../lib/i18n";
import { shuffleArray } from "../lib/sudoku-gen";
import type { StroopTelemetry } from "../lib/scoring";

// ─── Stroop Test ──────────────────────────────────────────────────────────────

const STROOP_COLORS = [
  { id: "red", hex: "#F43F5E", pattern: "solid" },
  { id: "blue", hex: "#3B82F6", pattern: "stripes" },
  { id: "green", hex: "#10B981", pattern: "dots" },
  { id: "yellow", hex: "#EAB308", pattern: "grid" },
  { id: "purple", hex: "#A855F7", pattern: "diag" },
  { id: "orange", hex: "#F97316", pattern: "rings" },
] as const;

const PATTERN_BG: Record<string, string> = {
  solid: "none",
  stripes:
    "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.18) 4px, rgba(0,0,0,0.18) 8px)",
  dots: "radial-gradient(rgba(0,0,0,0.22) 1.2px, transparent 1.3px)",
  grid: "linear-gradient(rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)",
  diag: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.16) 5px, rgba(0,0,0,0.16) 10px)",
  rings:
    "radial-gradient(transparent 40%, rgba(0,0,0,0.2) 41%, rgba(0,0,0,0.2) 55%, transparent 56%)",
};

type StroopColorId = (typeof STROOP_COLORS)[number]["id"];

interface Stimulus {
  wordId: StroopColorId; // the word displayed
  inkId: StroopColorId; // the actual ink color
  options: StroopColorId[]; // 4 answer choices (always includes inkId)
}

function makeStimulus(prevInkId?: StroopColorId): Stimulus {
  const ids = STROOP_COLORS.map((c) => c.id) as StroopColorId[];
  // always incongruent: ink ≠ word
  const wordId = ids[Math.floor(Math.random() * ids.length)];
  let inkCandidates = ids.filter((id) => id !== wordId);
  if (prevInkId) inkCandidates = inkCandidates.filter((id) => id !== prevInkId); // avoid back-to-back same ink
  if (!inkCandidates.length) inkCandidates = ids.filter((id) => id !== wordId);
  const inkId = inkCandidates[Math.floor(Math.random() * inkCandidates.length)];

  // 4 random options including inkId
  const others = shuffleArray(ids.filter((id) => id !== inkId)).slice(0, 3);
  const options = shuffleArray([inkId, ...others]);
  return { wordId, inkId, options };
}

export function StroopGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: StroopTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  const TOTAL = 20;
  const MAX_HEARTS = 3;

  const colorLabel = (id: StroopColorId): string =>
    (t[`color_${id}` as keyof typeof t] as string) ?? id.toUpperCase();
  const colorHex = (id: StroopColorId): string =>
    STROOP_COLORS.find((c) => c.id === id)!.hex;

  /** So giay dem nguoc sau khi bam START truoc khi stimulus dau tien hien. */
  const COUNTDOWN_FROM = 3;

  const [stimulus, setStimulus] = useState<Stimulus>(() => makeStimulus());
  const [trialsLeft, setTrialsLeft] = useState(TOTAL);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  // "countdown" chen giua idle va playing: truoc day stimulus hien ngay khi vao
  // man va dong ho chi chay tu click dau tien, nen cau 1 la "mien phi" (ngam bao
  // lau cung duoc) va RT cua no phai vut bo. Gio clock va RT deu tinh tu onset.
  const [status, setStatus] = useState<
    "idle" | "countdown" | "playing" | "done"
  >("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
  const [saving, setSaving] = useState(false);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const wrongRef = useRef(0);
  /** So lan stimulus da hien (ke ca cau sai) — gui len server thay vi hardcode 20. */
  const shownRef = useRef(1);
  // Per-trial reaction times. Stroop interference shows up in the RT spread,
  // not in the total — so Focus reads consistency while Speed reads the median.
  const rtsRef = useRef<number[]>([]);
  const lastTrialRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((x) => x !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
  }, []);

  useEffect(
    () => () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    },
    [],
  );

  const reset = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearTimers();
    wrongRef.current = 0;
    shownRef.current = 1;
    rtsRef.current = [];
    lastTrialRef.current = null;
    completedRef.current = false;
    setStimulus(makeStimulus());
    setTrialsLeft(TOTAL);
    setHearts(MAX_HEARTS);
    setStatus("idle");
    setCountdown(COUNTDOWN_FROM);
    setElapsed(0);
    setFlash(null);
    startRef.current = null;
    lastTrialRef.current = null;
  };

  /**
   * START -> dem nguoc -> stimulus dau tien hien, dong ho VA lastTrialRef cung
   * chay tu dung thoi diem onset do. Nho vay cau 1 duoc do that su.
   */
  const beginRound = useCallback(() => {
    if (status !== "idle") return;
    onPlayStart?.();
    setStatus("countdown");
    setCountdown(COUNTDOWN_FROM);

    for (let i = 1; i <= COUNTDOWN_FROM; i += 1) {
      later(() => setCountdown(COUNTDOWN_FROM - i), i * 1000);
    }

    later(() => {
      // Stimulus moi tinh tai onset, khong phai cai da nam san tren man hinh.
      setStimulus(makeStimulus());
      shownRef.current = 1;
      const onset = Date.now();
      startRef.current = onset;
      lastTrialRef.current = onset;
      setStatus("playing");
      intervalRef.current = setInterval(
        () => setElapsed(Date.now() - (startRef.current ?? Date.now())),
        50,
      );
    }, COUNTDOWN_FROM * 1000);
  }, [status, onPlayStart, later]);

  // Declarative end-of-round: fires onComplete exactly once when the run ends —
  // either all trials cleared or hearts exhausted. Running in an effect means it
  // can't be dropped by a stale closure inside the flash setTimeout callbacks.
  useEffect(() => {
    if (completedRef.current) return;
    if (status !== "playing") return;
    if (trialsLeft > 0 && hearts > 0) return;

    completedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const ms = Date.now() - (startRef.current ?? Date.now());
    // Thắng = hết trial. Hết tim là THUA, không được tính kỷ lục.
    const won = trialsLeft <= 0;
    setElapsed(ms);
    setStatus("done");
    if (won) setBestTime((prev) => (prev === null || ms < prev ? ms : prev));
    setSaving(true);
    (async () => {
      try {
        await onComplete({
          timeMs: ms,
          totalStimuli: shownRef.current,
          wrongClicks: wrongRef.current,
          rts: [...rtsRef.current],
        });
      } catch (err) {
        console.error("Stroop completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    })();
  }, [trialsLeft, hearts, status, onComplete]);

  const handleAnswer = useCallback(
    (chosen: StroopColorId) => {
      // Chi nhan cau tra loi khi van dang chay: idle/countdown thi chua co
      // stimulus hop le de cham diem.
      if (status !== "playing" || flash !== null) return;

      const now = Date.now();
      // RT = tu luc stimulus hien (lastTrialRef), KHONG gom thoi gian flash.
      const rt = now - (lastTrialRef.current ?? now);

      const correct = chosen === stimulus.inkId;
      setFlash(correct ? "correct" : "wrong");

      if (!correct) {
        wrongRef.current += 1;
        const nh = hearts - 1;
        setHearts(nh);
        later(() => {
          setFlash(null);
          if (nh > 0) {
            setStimulus(makeStimulus(stimulus.inkId));
            shownRef.current += 1;
            lastTrialRef.current = Date.now();
          }
        }, 420);
        return;
      }

      // Moi cau deu co RT that (do tu onset), ke ca cau dau tien.
      rtsRef.current.push(rt);

      const newLeft = trialsLeft - 1;
      setTrialsLeft(newLeft);
      later(() => {
        setFlash(null);
        if (newLeft > 0) {
          setStimulus(makeStimulus(stimulus.inkId));
          shownRef.current += 1;
          lastTrialRef.current = Date.now();
        }
      }, 240);
    },
    [status, flash, stimulus, hearts, trialsLeft, later],
  );

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const progress = (TOTAL - trialsLeft) / TOTAL;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(13,20,45,0.62)",
        border: "1px solid rgba(234,179,8,0.2)",
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div
            className="text-[11px] tracking-[0.2em] mb-1.5"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "#EAB308",
            }}
          >
            {t.stroop_tag}
          </div>
          <div className="text-base font-bold text-white">Stroop Test</div>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "rgba(234,179,8,0.18)",
            color: "#EAB308",
            border: "1px solid rgba(234,179,8,0.28)",
          }}
        >
          <Zap size={16} />
        </div>
      </div>

      {/* Score badge + hearts */}
      <div className="flex items-center gap-3 mt-3">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{
            background: "rgba(234,179,8,0.12)",
            border: "1px solid rgba(234,179,8,0.25)",
          }}
        >
          <Star size={11} style={{ color: "#EAB308" }} />
          <span
            className="text-[11px] font-bold"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "#EAB308",
            }}
          >
            +2 {t.stroop_inhibition.toUpperCase()}
          </span>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`${hearts}/${MAX_HEARTS} ${t.heart_full ?? "lives"}`}
        >
          {Array.from({ length: MAX_HEARTS }).map((_, i) => (
            <span
              key={i}
              role="img"
              aria-label={
                i < hearts
                  ? (t.heart_full ?? "Life remaining")
                  : (t.heart_empty ?? "Life lost")
              }
              style={{
                fontSize: 14,
                opacity: i < hearts ? 1 : 0.2,
                transition: "opacity 0.25s",
                filter:
                  i < hearts
                    ? "drop-shadow(0 0 4px rgba(239,68,68,0.6))"
                    : "none",
              }}
            >
              <span aria-hidden="true">❤️</span>
            </span>
          ))}
        </div>
      </div>

      {/* Timer row */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span
            className="text-[11px] text-slate-600 mb-0.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {t.time_label}
          </span>
          <div
            className="text-3xl font-bold tabular-nums"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: status === "done" ? "#10B981" : "#EAB308",
              textShadow:
                status === "done"
                  ? "0 0 24px rgba(16,185,129,0.5)"
                  : "0 0 18px rgba(234,179,8,0.4)",
            }}
          >
            {fmtTime(elapsed)}
          </div>
          {bestTime !== null && (
            <span
              className="text-[11px] mt-0.5"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "#475569",
              }}
            >
              {t.best_label} {fmtTime(bestTime)}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span
            className="text-[11px] text-slate-600 mb-0.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {t.stroop_trial}
          </span>
          <span
            className="text-4xl font-bold tabular-nums"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "#EAB308",
              textShadow: "0 0 20px rgba(234,179,8,0.55)",
            }}
          >
            {TOTAL - trialsLeft}/{TOTAL}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="mt-2.5 h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, #EAB308, #F97316)",
            boxShadow: "0 0 8px rgba(234,179,8,0.5)",
          }}
        />
      </div>

      {/* Instruction label */}
      <div className="mt-4 flex items-center justify-between">
        <span
          className="text-[11px] text-slate-500"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {t.stroop_instruction}
        </span>
        <span
          className="text-[11px] text-slate-600"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {t.stroop_hint}
        </span>
      </div>

      {/* ── Stimulus area ── */}
      <div
        className="mt-1.5 relative flex items-center justify-center rounded-2xl select-none"
        style={{
          minHeight: 120,
          background:
            flash === "correct"
              ? "rgba(16,185,129,0.08)"
              : flash === "wrong"
                ? "rgba(244,63,94,0.08)"
                : "rgba(0,0,0,0.22)",
          border:
            flash === "correct"
              ? "1px solid rgba(16,185,129,0.4)"
              : flash === "wrong"
                ? "1px solid rgba(244,63,94,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {status === "done" ? (
          <div
            className="flex items-center gap-2 text-emerald-400 text-sm font-bold py-10"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            <CheckCircle size={16} /> {t.stroop_complete}
          </div>
        ) : status === "idle" ? (
          <div className="py-8 px-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={beginRound}
              className="rounded-xl px-8 py-3 font-black tracking-[0.15em] text-white transition-all duration-150 hover:brightness-110"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 20,
                background: "rgba(16,185,129,0.16)",
                border: "1.5px solid rgba(16,185,129,0.55)",
                boxShadow: "0 0 22px rgba(16,185,129,0.25)",
              }}
            >
              START
            </button>
          </div>
        ) : status === "countdown" ? (
          <div className="py-8 px-6 flex flex-col items-center gap-2">
            <span
              className="font-black tracking-[0.15em] select-none text-white"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 52,
              }}
            >
              {countdown > 0 ? countdown : "GO"}
            </span>
          </div>
        ) : (
          <div className="py-8 px-6 flex flex-col items-center gap-2">
            {/* The word, rendered in its INK color — always visible */}
            <span
              className="font-black tracking-[0.15em] select-none"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 52,
                color: colorHex(stimulus.inkId),
                textShadow: `0 0 28px ${colorHex(stimulus.inkId)}99`,
                transition: "color 0.12s",
                filter: flash
                  ? `brightness(${flash === "correct" ? 1.6 : 0.8})`
                  : "none",
              }}
            >
              {colorLabel(stimulus.wordId)}
            </span>
          </div>
        )}
      </div>

      {/* ── Color choice buttons ── */}
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {stimulus.options.map((cid) => {
          const hex = colorHex(cid);
          const isCorrect = flash === "correct" && cid === stimulus.inkId;
          const isWrong = flash === "wrong";
          return (
            <button
              key={cid}
              type="button"
              onClick={() => {
                if (status === "playing") handleAnswer(cid);
              }}
              disabled={flash !== null || status !== "playing"}
              aria-label={colorLabel(cid)}
              className="rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-60"
              style={{
                padding: "10px 6px",
                background: isCorrect
                  ? `${hex}44`
                  : isWrong && cid === stimulus?.inkId
                    ? `${hex}33`
                    : `${hex}18`,
                border: `1.5px solid ${hex}${isCorrect ? "cc" : "55"}`,
                boxShadow: isCorrect ? `0 0 18px ${hex}66` : "none",
                transform: isCorrect ? "scale(0.95)" : "scale(1)",
              }}
            >
              <div
                className="w-5 h-5 rounded-full"
                aria-hidden="true"
                style={{
                  backgroundColor: hex,
                  backgroundImage:
                    PATTERN_BG[
                      STROOP_COLORS.find((c) => c.id === cid)?.pattern ??
                        "solid"
                    ],
                  backgroundSize: ["dots", "grid"].includes(
                    STROOP_COLORS.find((c) => c.id === cid)?.pattern ?? "solid",
                  )
                    ? "6px 6px"
                    : undefined,
                  boxShadow: `0 0 8px ${hex}88`,
                }}
              />
              <span
                className="text-[11px] font-bold tracking-wider"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: hex,
                }}
              >
                {colorLabel(cid)}
              </span>
            </button>
          );
        })}
      </div>

      {saving && (
        <div
          className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={reset}
        aria-label={t.new_game}
        className="mt-4 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 hover:brightness-125"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          background: "rgba(234,179,8,0.14)",
          color: "#EAB308",
          border: "1px solid rgba(234,179,8,0.25)",
        }}
      >
        <RefreshCw size={12} /> {t.new_game}
      </button>
    </div>
  );
}
