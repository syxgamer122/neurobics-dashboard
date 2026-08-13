import { useState, useEffect, useCallback, useRef } from "react";
import { Blocks, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useGameLifecycle } from "../lib/use-game-lifecycle";
import { usePress, type InputType } from "../lib/use-press";
import type { CorsiTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Corsi Block Tapping ────────────────────────────────────────────────────
// Bai do TRI NHO LAM VIEC KHONG GIAN kinh dien. Mot chuoi o sang len lan luot,
// nguoi choi bam lai dung THU TU do. Do dai chuoi tang dan cho den khi sai.
//
// Vi sao Memory chinh / Spatial phu (khong co Speed):
// - Chuoi cang dai cang phai giu nhieu vi tri trong dau => day la span tri nho.
// - Vi tri o la thong tin khong gian thuan => Spatial la truc phu that su.
// - Pha "xem" co thoi luong CO DINH, nen dong ho ca van khong phan anh nhip do
//   cua nguoi choi. Bia ra diem Speed tu do la sai — de null, giong Memory Matrix.

const GRID_SIZE = 9; // luoi 3x3
const START_SPAN = 2;
const MAX_SPAN = 9;
const LIVES_PER_SPAN = 2; // sai ca hai lan o cung do dai thi dung
const FLASH_MS = 620;
const GAP_MS = 260;
const ACCENT = "#14B8A6";

type CorsiPhase = "idle" | "watch" | "recall" | "feedback" | "done";

function randomSequence(length: number): number[] {
  // Lay mau khong lap: mot o khong xuat hien hai lan trong cung chuoi.
  const pool = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(length, GRID_SIZE));
}

export function CorsiBlockGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: CorsiTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const press = usePress();
  const { t } = useLang();

  const [phase, setPhaseState] = useState<CorsiPhase>("idle");
  const phaseRef = useRef<CorsiPhase>("idle");
  const setPhase = useCallback((p: CorsiPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [span, setSpan] = useState(START_SPAN);
  const [sequence, setSequence] = useState<number[]>([]);
  const [litIndex, setLitIndex] = useState<number | null>(null);
  const [tapped, setTapped] = useState<number[]>([]);
  const tappedRef = useRef<number[]>([]);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [bestSpan, setBestSpan] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [saving, setSaving] = useState(false);

  // Telemetry tich luy — dung ref de khong phu thuoc nhip re-render.
  const trialsRef = useRef(0);
  const correctTrialsRef = useRef(0);
  const wrongClicksRef = useRef(0);
  const tapsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const recallMsRef = useRef(0);
  const bestSpanRef = useRef(0);
  const livesRef = useRef(0);
  const inputTypesRef = useRef<Set<InputType>>(new Set());

  const lastTapAtRef = useRef(0);
  const recallStartRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  /** Chieu chuoi roi chuyen sang pha bam lai. */
  const playSequence = useCallback(
    (seq: number[]) => {
      clearTimers();
      setPhase("watch");
      setTapped([]);
      tappedRef.current = [];
      setLitIndex(null);

      seq.forEach((cell, i) => {
        later(() => setLitIndex(cell), i * (FLASH_MS + GAP_MS) + GAP_MS);
        later(
          () => setLitIndex(null),
          i * (FLASH_MS + GAP_MS) + GAP_MS + FLASH_MS,
        );
      });

      later(
        () => {
          setPhase("recall");
          // Dong ho CHI chay trong pha bam lai — pha xem la thoi gian cua he
          // thong, khong phai cua nguoi choi.
          recallStartRef.current = performance.now();
          lastTapAtRef.current = recallStartRef.current;
        },
        seq.length * (FLASH_MS + GAP_MS) + GAP_MS,
      );
    },
    [clearTimers, later, setPhase],
  );

  const finishGame = useCallback(async () => {
    clearTimers();
    setPhase("done");
    setSaving(true);

    try {
      let finalInput = "mouse";
      if (inputTypesRef.current.has("touch")) finalInput = "touch";
      else if (inputTypesRef.current.has("key")) finalInput = "key";

      await onComplete({
        timeMs: Math.max(1, Math.round(recallMsRef.current)),
        span: bestSpanRef.current,
        trials: trialsRef.current,
        correctTrials: correctTrialsRef.current,
        taps: tapsRef.current,
        wrongClicks: wrongClicksRef.current,
        rts: rtsRef.current.slice(),
        inputType: finalInput as InputType,
      });
    } catch (err) {
      logError("Corsi completion: onComplete failed:", err);
    } finally {
      setSaving(false);
    }
  }, [clearTimers, onComplete, setPhase]);

  const startGame = () => {
    onPlayStart?.();
    clearTimers();

    trialsRef.current = 0;
    correctTrialsRef.current = 0;
    wrongClicksRef.current = 0;
    tapsRef.current = 0;
    rtsRef.current = [];
    inputTypesRef.current = new Set();
    recallMsRef.current = 0;
    bestSpanRef.current = 0;
    livesRef.current = 0;

    setSpan(START_SPAN);
    setBestSpan(0);
    setMistakes(0);
    setLastCorrect(null);

    const seq = randomSequence(START_SPAN);
    setSequence(seq);
    trialsRef.current = 1;
    playSequence(seq);
  };

  const resetGame = () => {
    clearTimers();
    setPhase("idle");
    setSequence([]);
    setTapped([]);
    tappedRef.current = [];
    setLitIndex(null);
    setLastCorrect(null);
    setSpan(START_SPAN);
    setBestSpan(0);
    setMistakes(0);
  };

  /** Ket thuc mot luot: dung hoac sai. */
  const settleTrial = useCallback(
    (success: boolean) => {
      recallMsRef.current += performance.now() - recallStartRef.current;
      setPhase("feedback");
      setLastCorrect(success);

      if (success) {
        correctTrialsRef.current += 1;
        livesRef.current = 0;
        if (span > bestSpanRef.current) {
          bestSpanRef.current = span;
          setBestSpan(span);
        }

        const nextSpan = span + 1;
        if (nextSpan > MAX_SPAN) {
          later(() => void finishGame(), 700);
          return;
        }

        later(() => {
          setSpan(nextSpan);
          const seq = randomSequence(nextSpan);
          setSequence(seq);
          trialsRef.current += 1;
          playSequence(seq);
        }, 700);
        return;
      }

      livesRef.current += 1;
      setMistakes((m) => m + 1);

      if (livesRef.current >= LIVES_PER_SPAN) {
        later(() => void finishGame(), 800);
        return;
      }

      // Con luot thu lai o cung do dai: chuoi moi, cung chieu dai.
      later(() => {
        const seq = randomSequence(span);
        setSequence(seq);
        trialsRef.current += 1;
        playSequence(seq);
      }, 800);
    },
    [finishGame, later, playSequence, span, setPhase],
  );

  const handleCell = (cell: number, inputType?: InputType) => {
    if (inputType) inputTypesRef.current.add(inputType);
    if (phaseRef.current !== "recall") return;

    const now = performance.now();
    const gap = Math.max(1, Math.round(now - lastTapAtRef.current));
    lastTapAtRef.current = now;
    rtsRef.current.push(gap);
    tapsRef.current += 1;

    const currentTapped = tappedRef.current;
    const position = currentTapped.length;
    const expected = sequence[position];

    if (cell !== expected) {
      wrongClicksRef.current += 1;
      settleTrial(false);
      return;
    }

    const next = [...currentTapped, cell];
    tappedRef.current = next;
    setTapped(next);

    if (next.length === sequence.length) settleTrial(true);
  };

  const statusText =
    phase === "watch"
      ? t.corsi_watch
      : phase === "recall"
        ? t.corsi_recall
        : phase === "feedback"
          ? lastCorrect
            ? t.answer_correct
            : t.answer_wrong
          : "";

  const cellState = (cell: number): "lit" | "tapped" | "idle" => {
    if (phase === "watch" && litIndex === cell) return "lit";
    if (phase === "recall" && tapped.includes(cell)) return "tapped";
    if (
      phase === "feedback" &&
      lastCorrect === false &&
      sequence.includes(cell)
    )
      return "lit";
    return "idle";
  };

  useGameLifecycle({
    isActive: () => phaseRef.current === "watch" || phaseRef.current === "recall" || phaseRef.current === "feedback",
    onLeave: resetGame,
  });

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(var(--neuro-panel-rgb),0.62)",
        border: `1px solid ${ACCENT}33`,
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{ color: ACCENT }}
          >
            {t.corsi_tag}
          </div>
          <div className="text-base font-bold text-foreground">Corsi Block</div>
        </div>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: `${ACCENT}2E`,
            color: ACCENT,
            border: `1px solid ${ACCENT}47`,
          }}
        >
          <Blocks size={17} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.corsi_level}</div>
          <div className="text-lg font-bold text-foreground">{span}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.corsi_span}</div>
          <div className="text-lg font-bold" style={{ color: ACCENT }}>
            {bestSpan || "--"}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.corsi_mistakes}</div>
          <div className="text-lg font-bold text-[#F43F5E]">{mistakes}</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500 text-center">
        {t.corsi_hint}
      </div>

      {phase === "idle" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 300 }}
        >
          <Blocks size={46} style={{ color: ACCENT }} className="mb-5" />
          <p className="text-sm text-slate-400 text-center leading-relaxed">
            {t.corsi_intro_1}
            <br />
            {t.corsi_intro_2}
          </p>
          <button
            onClick={startGame}
            className="mt-6 px-8 py-3 rounded-xl text-sm font-bold tracking-widest hover:scale-105 transition-all font-mono"
            style={{
              background: `${ACCENT}26`,
              color: ACCENT,
              border: `1px solid ${ACCENT}66`,
            }}
          >
            {t.corsi_start}
          </button>
        </div>
      ) : phase === "done" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 300 }}
        >
          <CheckCircle size={48} className="text-emerald-400 mb-4" />
          <div className="text-lg font-bold text-foreground">
            {t.corsi_complete}
          </div>
          <div className="mt-2 text-4xl font-bold" style={{ color: ACCENT }}>
            {bestSpan}
          </div>
          <div className="mt-1 text-xs text-slate-500">{t.corsi_span}</div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center">
          <div
            className="text-xs tracking-[0.2em] font-mono mb-3"
            style={{
              color:
                phase === "recall"
                  ? ACCENT
                  : lastCorrect === false
                    ? "#F43F5E"
                    : "#94A3B8",
            }}
          >
            {statusText}
          </div>

          <div
            className="grid grid-cols-3 gap-3"
            style={{ width: "100%", maxWidth: 300 }}
          >
            {Array.from({ length: GRID_SIZE }, (_, cell) => {
              const state = cellState(cell);
              const interactive = phase === "recall";
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={!interactive}
                  {...press((type: InputType) => handleCell(cell, type))}
                  className="rounded-xl transition-all game-surface active:scale-95"
                  style={{
                    aspectRatio: "1 / 1",
                    background:
                      state === "lit"
                        ? `${ACCENT}D9`
                        : state === "tapped"
                          ? `${ACCENT}59`
                          : "rgba(255,255,255,0.04)",
                    border:
                      state === "idle"
                        ? "1px solid rgba(255,255,255,0.08)"
                        : `1px solid ${ACCENT}`,
                    boxShadow:
                      state === "lit" ? `0 0 28px ${ACCENT}80` : "none",
                    cursor: interactive ? "pointer" : "default",
                  }}
                />
              );
            })}
          </div>

          <div className="mt-4 flex gap-1.5">
            {sequence.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: 8,
                  height: 8,
                  background:
                    i < tapped.length ? ACCENT : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {saving && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          {t.corsi_saving}
        </div>
      )}

      {phase !== "idle" && (
        <button
          disabled={saving}
          onClick={resetGame}
          className="mt-5 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2"
          style={{
            background: `${ACCENT}1A`,
            color: ACCENT,
            border: `1px solid ${ACCENT}40`,
          }}
        >
          <RefreshCw size={12} />
          {t.corsi_restart}
        </button>
      )}
    </div>
  );
}
