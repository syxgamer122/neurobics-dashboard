import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Loader2, RefreshCw, Route } from "lucide-react";
import { useLang } from "../lib/i18n";
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
const MIN_DIST = 17; // khoang cach toi thieu giua hai tam, tinh theo %
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
    // Rejection sampling co gioi han: neu het luot thi chap nhan diem cuoi.
    for (let attempt = 0; attempt < 220; attempt++) {
      x = 8 + Math.random() * 84;
      y = 8 + Math.random() * 84;
      const clash = placed.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_DIST);
      if (!clash) break;
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
  const { t } = useLang();

  const [phase, setPhase] = useState<TrailPhase>("idle");
  const [nodes, setNodes] = useState<TrailNode[]>([]);
  const [progress, setProgress] = useState(0); // so diem da noi dung
  const [mistakes, setMistakes] = useState(0);
  const [wrongLabel, setWrongLabel] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  const startedAtRef = useRef(0);
  const lastHitAtRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
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
    wrongRef.current = 0;
    startedAtRef.current = 0;
    lastHitAtRef.current = 0;

    setNodes(buildTrail());
    setProgress(0);
    setMistakes(0);
    setWrongLabel(null);
    setElapsed(0);
    setPhase("playing");
  };

  const resetGame = () => {
    stopTimers();
    setPhase("idle");
    setNodes([]);
    setProgress(0);
    setMistakes(0);
    setWrongLabel(null);
    setElapsed(0);
  };

  const finishGame = useCallback(
    async (totalMs: number) => {
      stopTimers();
      setPhase("done");
      setSaving(true);

      try {
        await onComplete({
          timeMs: Math.max(1, Math.round(totalMs)),
          nodes: PAIRS * 2,
          mode: "B",
          wrongClicks: wrongRef.current,
          rts: rtsRef.current.slice(),
        });
      } catch (err) {
        logError("Trail Making completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [onComplete, stopTimers],
  );

  const handleNode = (label: string, index: number) => {
    if (phase !== "playing") return;

    // Sai thu tu: ghi nhan, nhay do, KHONG tinh RT (bam bua khong duoc
    // thuong toc do — va cung khong pha median cua nhung buoc that).
    if (index !== progress) {
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
    if (progress === 0) {
      startedAtRef.current = now;
      lastHitAtRef.current = now;
      tickRef.current = setInterval(() => {
        setElapsed(performance.now() - startedAtRef.current);
      }, 100);
    } else {
      rtsRef.current.push(Math.max(1, Math.round(now - lastHitAtRef.current)));
      lastHitAtRef.current = now;
    }

    const next = progress + 1;
    setProgress(next);

    if (next >= nodes.length) {
      void finishGame(now - startedAtRef.current);
    }
  };

  const nextLabel = phase === "playing" ? (nodes[progress]?.label ?? "") : "";
  const seconds = (elapsed / 1000).toFixed(1);

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(13,20,45,0.62)",
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
          <div className="text-base font-bold text-white">Trail Making</div>
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
          <div className="text-lg font-bold text-white">
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
          <div className="text-lg font-bold text-white">{t.trail_complete}</div>
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
                  onClick={() => handleNode(node.label, i)}
                  className="absolute rounded-full font-mono font-bold transition-colors"
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: 38,
                    height: 38,
                    fontSize: 13,
                    background: isWrong
                      ? "rgba(244,63,94,0.35)"
                      : done
                        ? `${ACCENT}40`
                        : "rgba(13,20,45,0.9)",
                    color: isWrong ? "#FDA4AF" : done ? ACCENT : "#E2E8F0",
                    border: isWrong
                      ? "1px solid rgba(244,63,94,0.9)"
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
