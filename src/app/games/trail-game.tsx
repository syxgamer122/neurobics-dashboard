import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Loader2, RefreshCw, Route } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useGameLifecycle } from "../lib/use-game-lifecycle";
import { usePress, type InputType } from "../lib/use-press";
import type { TrailTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Trail Making Test B ───────────────────────────────────────────────────
// Noi 1 → A → 2 → B → 3 → C ... nhanh nhat co the.
//
// Vi sao Speed chinh / Focus phu:
// - Moi buoc la mot lan QUET thi giac + chuyen bo quy tac (so ↔ chu). Nhip giua
//   cac buoc la tin hieu toc do xu ly that su, do duoc bang median hop RT.
// - Bam nham va nhip khong deu phan anh mat kiem soat chu y => Focus.
// - Khong co suy luan (Logic null) va khong phai giu thong tin trong dau
//   (Memory null). Vi tri diem la ngau nhien moi van nen khong the hoc thuoc.

const PAIRS = 12; // 1..12 + A..L = 24 diem
const LETTERS = "ABCDEFGHIJKL";
const MIN_DIST = 20; // khoang cach toi thieu giua hai tam, tinh theo %
const ACCENT = "#84CC16";

type TrailPhase = "idle" | "playing" | "done";

type TrailNode = {
  label: string;
  x: number; // %
  y: number; // %
};

/** Rai diem ngau nhien nhung khong de hai diem de len nhau. */
function buildTrail(): TrailNode[] {
  const labels: string[] = [];
  for (let i = 0; i < PAIRS; i++) {
    labels.push(String(i + 1));
    labels.push(LETTERS[i]);
  }

  const placed: { x: number; y: number }[] = [];
  const nodes: TrailNode[] = [];

  for (const label of labels) {
    let x = 50;
    let y = 50;
    let success = false;
    for (let attempt = 0; attempt < 220; attempt++) {
      x = 8 + Math.random() * 84;
      y = 8 + Math.random() * 84;
      const clash = placed.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_DIST);
      if (!clash) {
        success = true;
        break;
      }
    }
    if (!success) {
      return buildTrail();
    }
    placed.push({ x, y });
    nodes.push({ label, x, y });
  }

  return nodes;
}

export function TrailMakingGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: TrailTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const press = usePress();
  const { t } = useLang();

  const [phase, setPhase] = useState<TrailPhase>("idle");
  const [nodes, setNodes] = useState<TrailNode[]>([]);
  const [progress, setProgress] = useState(0); // so diem da noi dung
  const progressRef = useRef(0);
  const finishedRef = useRef(false);
  const [mistakes, setMistakes] = useState(0);
  const [wrongLabel, setWrongLabel] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  const startedAtRef = useRef(0);
  const lastHitAtRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const inputTypesRef = useRef<Set<InputType>>(new Set());
  const wrongRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (flashRef.current) {
      clearTimeout(flashRef.current);
      flashRef.current = null;
    }
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  const startGame = () => {
    onPlayStart?.();
    stopTimers();

    rtsRef.current = [];
    inputTypesRef.current = new Set();
    wrongRef.current = 0;
    startedAtRef.current = 0;
    lastHitAtRef.current = 0;
    finishedRef.current = false;

    setNodes(buildTrail());
    progressRef.current = 0;
    setProgress(0);
    setMistakes(0);
    setWrongLabel(null);
    setElapsed(0);
    setPhase("playing");
  };

  const resetGame = useCallback(() => {
    stopTimers();
    setPhase("idle");
    setNodes([]);
    setProgress(0);
    progressRef.current = 0;
    finishedRef.current = false;
    setMistakes(0);
    setWrongLabel(null);
    setElapsed(0);
  }, [stopTimers]);

  const finishGame = useCallback(
    async (totalMs: number) => {
      stopTimers();
      setPhase("done");
      setSaving(true);

      try {
        let finalInput = "mouse";
        if (inputTypesRef.current.has("touch")) finalInput = "touch";
        else if (inputTypesRef.current.has("key")) finalInput = "key";

        await onComplete({
          timeMs: Math.max(1, Math.round(totalMs)),
          nodes: PAIRS * 2,
          mode: "B",
          wrongClicks: wrongRef.current,
          rts: rtsRef.current.slice(),
          inputType: finalInput as InputType,
        });
      } catch (err) {
        logError("Trail Making completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [onComplete, stopTimers],
  );

  const handleNode = (label: string, index: number, inputType?: InputType) => {
    if (inputType) inputTypesRef.current.add(inputType);
    if (phase !== "playing" || finishedRef.current) return;

    // Sai thu tu: ghi nhan, nhay do, KHONG tinh RT (bam bua khong duoc
    // thuong toc do — va cung khong pha median cua nhung buoc that).
    if (index !== progressRef.current) {
      wrongRef.current += 1;
      setMistakes(wrongRef.current);
      setWrongLabel(label);
      if (flashRef.current) clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setWrongLabel(null), 320);
      return;
    }

    const now = performance.now();

    // Dong ho bat dau tu cu bam DUNG dau tien, giong Schulte: khong tinh
    // thoi gian nguoi choi con dang doc de.
    if (progressRef.current === 0) {
      startedAtRef.current = now;
      lastHitAtRef.current = now;
      tickRef.current = setInterval(() => {
        setElapsed(performance.now() - startedAtRef.current);
      }, 100);
    } else {
      const rawRt = now - lastHitAtRef.current;
      rtsRef.current.push(Math.min(10000, Math.max(120, Math.round(rawRt))));
      lastHitAtRef.current = now;
    }

    const next = progressRef.current + 1;
    progressRef.current = next;
    setProgress(next);

    if (next >= nodes.length) {
      finishedRef.current = true;
      void finishGame(now - startedAtRef.current);
    }
  };

  const nextLabel = phase === "playing" ? (nodes[progress]?.label ?? "") : "";
  const seconds = (elapsed / 1000).toFixed(1);

  useGameLifecycle({
    isActive: () => phase === "playing",
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
            {t.trail_tag}
          </div>
          <div className="text-base font-bold text-foreground">
            Trail Making
          </div>
        </div>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: `${ACCENT}2E`,
            color: ACCENT,
            border: `1px solid ${ACCENT}47`,
          }}
        >
          <Route size={17} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.trail_progress}</div>
          <div className="text-lg font-bold text-foreground">
            {progress}/{PAIRS * 2}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.trail_elapsed}</div>
          <div className="text-lg font-bold" style={{ color: ACCENT }}>
            {seconds}s
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">{t.trail_mistakes}</div>
          <div className="text-lg font-bold text-[#F43F5E]">{mistakes}</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500 text-center">
        {t.trail_hint}
      </div>

      {phase === "idle" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 320 }}
        >
          <Route size={46} style={{ color: ACCENT }} className="mb-5" />
          <p className="text-sm text-slate-400 text-center leading-relaxed">
            {t.trail_intro_1}
            <br />
            {t.trail_intro_2}
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
            {t.trail_start}
          </button>
        </div>
      ) : phase === "done" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 320 }}
        >
          <CheckCircle size={48} className="text-emerald-400 mb-4" />
          <div className="text-lg font-bold text-foreground">
            {t.trail_complete}
          </div>
          <div className="mt-2 text-4xl font-bold" style={{ color: ACCENT }}>
            {seconds}s
          </div>
          <div className="mt-1 text-xs text-slate-500">{t.trail_elapsed}</div>
        </div>
      ) : (
        <>
          <div
            className="mt-4 text-center text-xs font-mono tracking-[0.2em]"
            style={{ color: ACCENT }}
          >
            {t.trail_next}: {nextLabel}
          </div>

          <div
            className="mt-3 relative rounded-xl"
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* Duong noi cac diem da di qua */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {nodes.slice(0, Math.max(0, progress)).map((node, i) => {
                if (i === 0) return null;
                const prev = nodes[i - 1];
                return (
                  <line
                    key={`${node.label}-link`}
                    x1={prev.x}
                    y1={prev.y}
                    x2={node.x}
                    y2={node.y}
                    stroke={ACCENT}
                    strokeWidth={0.6}
                    strokeOpacity={0.55}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {nodes.map((node, i) => {
              const done = i < progress;
              const isNext = i === progress;
              const isWrong = wrongLabel === node.label;
              return (
                <button
                  key={node.label}
                  type="button"
                  {...press((type: InputType) => handleNode(node.label, i, type))}
                  className="absolute rounded-full font-mono font-bold transition-colors game-surface active:scale-95"
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: 50,
                    height: 50,
                    fontSize: 15,
                    touchAction: "manipulation",
                    background: isWrong
                      ? "rgba(var(--neuro-red-rgb),0.35)"
                      : done
                        ? `${ACCENT}40`
                        : "rgba(var(--neuro-panel-rgb),0.9)",
                    color: isWrong ? "#FDA4AF" : done ? ACCENT : "#E2E8F0",
                    border: isWrong
                      ? "1px solid rgba(var(--neuro-red-rgb),0.9)"
                      : done
                        ? `1px solid ${ACCENT}`
                        : isNext
                          ? "1px solid rgba(255,255,255,0.35)"
                          : "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  {node.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {saving && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          {t.trail_saving}
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
          {t.trail_restart}
        </button>
      )}
    </div>
  );
}
