import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, RotateCcw, X } from "lucide-react";
import { useLang } from "../lib/i18n";
import type { MentalRotationTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Mental Rotation (2D) ───────────────────────────────────────────────────
// Hai hình đa giác: hình phải là bản xoay (SAME) hoặc bản gương + xoay (MIRROR).
// Spatial chính; Speed phụ từ RT. Server chấm lại toàn bộ.

const TOTAL = 24;
const ACCENT = "#22D3EE";
const ANGLES = [0, 60, 120, 180, 240, 300] as const;

type Phase = "idle" | "playing" | "done";

type Trial = {
  /** Góc xoay hình phải (độ). */
  angle: number;
  /** true = hình gương (khác), false = cùng hình xoay. */
  mirror: boolean;
  /** Chỉ số hình gốc trong SHAPES. */
  shapeId: number;
};

const panelStyle: React.CSSProperties = {
  background: "rgba(13,20,45,0.62)",
  border: `1px solid ${ACCENT}33`,
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
  boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
};

/** Các đa giác 2D đơn giản (tọa độ -1..1), vẽ bằng SVG polygon. */
const SHAPES: number[][][] = [
  // Mũi tên / chevron
  [
    [0, -0.9],
    [0.7, 0.1],
    [0.25, 0.1],
    [0.25, 0.9],
    [-0.25, 0.9],
    [-0.25, 0.1],
    [-0.7, 0.1],
  ],
  // Chữ L
  [
    [-0.7, -0.9],
    [0.1, -0.9],
    [0.1, 0.3],
    [0.7, 0.3],
    [0.7, 0.9],
    [-0.7, 0.9],
  ],
  // Z / sét
  [
    [-0.8, -0.85],
    [0.5, -0.85],
    [0.5, -0.25],
    [0.85, -0.25],
    [-0.4, 0.85],
    [-0.85, 0.85],
    [-0.85, 0.25],
    [-0.5, 0.25],
  ],
  // T
  [
    [-0.85, -0.9],
    [0.85, -0.9],
    [0.85, -0.35],
    [0.25, -0.35],
    [0.25, 0.9],
    [-0.25, 0.9],
    [-0.25, -0.35],
    [-0.85, -0.35],
  ],
  // F
  [
    [-0.7, -0.9],
    [0.75, -0.9],
    [0.75, -0.45],
    [-0.15, -0.45],
    [-0.15, -0.1],
    [0.55, -0.1],
    [0.55, 0.3],
    [-0.15, 0.3],
    [-0.15, 0.9],
    [-0.7, 0.9],
  ],
  // Cờ / P lệch
  [
    [-0.65, -0.9],
    [0.35, -0.9],
    [0.75, -0.45],
    [0.35, 0.05],
    [-0.15, 0.05],
    [-0.15, 0.9],
    [-0.65, 0.9],
  ],
];

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildTrials(total: number): Trial[] {
  const out: Trial[] = [];
  // ~50% mirror
  for (let i = 0; i < total; i++) {
    out.push({
      angle: ANGLES[i % ANGLES.length],
      mirror: i % 2 === 1,
      shapeId: i % SHAPES.length,
    });
  }
  // Xáo nhưng giữ phân bố góc khá đều
  return shuffleInPlace(out);
}

function pointsToSvg(
  pts: number[][],
  opts: { mirror?: boolean; angle?: number; size?: number },
): string {
  const size = opts.size ?? 120;
  const cx = size / 2;
  const cy = size / 2;
  const scale = size * 0.38;
  const rad = ((opts.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const mirror = opts.mirror ? -1 : 1;

  return pts
    .map(([x, y]) => {
      const mx = x * mirror;
      const rx = mx * cos - y * sin;
      const ry = mx * sin + y * cos;
      return `${cx + rx * scale},${cy + ry * scale}`;
    })
    .join(" ");
}

function ShapeView({
  shapeId,
  angle,
  mirror,
  label,
}: {
  shapeId: number;
  angle: number;
  mirror: boolean;
  label: string;
}) {
  const pts = SHAPES[shapeId] ?? SHAPES[0];
  const poly = pointsToSvg(pts, { angle, mirror, size: 140 });
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-2xl flex items-center justify-center"
        style={{
          width: 148,
          height: 148,
          background: "rgba(5,10,24,0.75)",
          border: `1px solid ${ACCENT}33`,
          boxShadow: `inset 0 0 24px ${ACCENT}14`,
        }}
      >
        <svg width={140} height={140} viewBox="0 0 140 140" aria-hidden>
          <polygon
            points={poly}
            fill={`${ACCENT}33`}
            stroke={ACCENT}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-[10px] tracking-[0.2em] text-slate-500 font-mono">
        {label}
      </span>
    </div>
  );
}

export function MentalRotationGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: MentalRotationTelemetry) => Promise<void> | void;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>("idle");
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  const trialsRef = useRef<Trial[]>([]);
  const startedAtRef = useRef(0);
  const qStartRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const anglesRef = useRef<number[]>([]);
  const mirrorsRef = useRef<boolean[]>([]);
  const correctFlagsRef = useRef<boolean[]>([]);
  const statsRef = useRef({ correct: 0, wrong: 0 });
  const finishedRef = useRef(false);
  const lockRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlashTimer = useCallback(() => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearFlashTimer(), [clearFlashTimer]);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearFlashTimer();
    setPhase("done");
    setSaving(true);
    const s = statsRef.current;
    try {
      await onComplete({
        timeMs: Math.max(1, Date.now() - startedAtRef.current),
        trials: TOTAL,
        correct: s.correct,
        wrong: s.wrong,
        angles: [...anglesRef.current],
        mirrors: [...mirrorsRef.current],
        correctFlags: [...correctFlagsRef.current],
        rts: [...rtsRef.current],
      });
    } catch (err) {
      logError("Mental Rotation completion failed:", err);
    } finally {
      setSaving(false);
    }
  }, [clearFlashTimer, onComplete]);

  const start = () => {
    onPlayStart?.();
    clearFlashTimer();
    finishedRef.current = false;
    lockRef.current = false;
    trialsRef.current = buildTrials(TOTAL);
    rtsRef.current = [];
    anglesRef.current = [];
    mirrorsRef.current = [];
    correctFlagsRef.current = [];
    statsRef.current = { correct: 0, wrong: 0 };
    setStats(statsRef.current);
    setFlash(null);
    setIdx(0);
    setPhase("playing");
    startedAtRef.current = Date.now();
    qStartRef.current = performance.now();
  };

  const answer = (same: boolean) => {
    if (phase !== "playing" || lockRef.current || finishedRef.current) return;
    lockRef.current = true;

    const trial = trialsRef.current[idx];
    if (!trial) return;

    // SAME = không gương; MIRROR = gương.
    const isSame = !trial.mirror;
    const ok = same === isSame;
    const rt = Math.max(1, Math.round(performance.now() - qStartRef.current));

    rtsRef.current.push(rt);
    anglesRef.current.push(trial.angle);
    mirrorsRef.current.push(trial.mirror);
    correctFlagsRef.current.push(ok);

    if (ok) {
      statsRef.current = {
        ...statsRef.current,
        correct: statsRef.current.correct + 1,
      };
    } else {
      statsRef.current = {
        ...statsRef.current,
        wrong: statsRef.current.wrong + 1,
      };
    }
    setStats(statsRef.current);
    setFlash(ok ? "ok" : "bad");

    clearFlashTimer();
    flashTimerRef.current = setTimeout(() => {
      setFlash(null);
      const next = idx + 1;
      if (next >= TOTAL) {
        void finish();
        return;
      }
      setIdx(next);
      qStartRef.current = performance.now();
      lockRef.current = false;
    }, 380);
  };

  const trial = trialsRef.current[idx];
  const progress = phase === "playing" ? idx / TOTAL : phase === "done" ? 1 : 0;

  const accuracyPct = useMemo(() => {
    const t = stats.correct + stats.wrong;
    if (!t) return 0;
    return Math.round((stats.correct / t) * 100);
  }, [stats]);

  return (
    <div className="rounded-2xl p-5 flex flex-col" style={panelStyle}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{ color: ACCENT }}
          >
            {t.mr_tag}
          </div>
          <div className="text-base font-bold text-white">Mental Rotation</div>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `${ACCENT}22`,
            color: ACCENT,
            border: `1px solid ${ACCENT}44`,
          }}
        >
          <RotateCcw size={16} />
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mb-3">{t.mr_hint}</p>

      {phase === "idle" && (
        <>
          <div
            className="rounded-xl p-3 mb-4 text-xs leading-relaxed text-slate-300 space-y-1"
            style={{
              background: "rgba(5,10,24,0.55)",
              border: `1px solid ${ACCENT}22`,
            }}
          >
            <div>{t.mr_intro_1}</div>
            <div>{t.mr_intro_2}</div>
          </div>
          <button
            type="button"
            onClick={start}
            className="w-full py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2 font-mono font-bold"
            style={{
              background: `${ACCENT}22`,
              border: `1px solid ${ACCENT}55`,
              color: ACCENT,
            }}
          >
            <Play size={14} /> {t.mr_start}
          </button>
        </>
      )}

      {phase === "playing" && trial && (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-mono">
            <span>
              {t.mr_trial} {idx + 1}/{TOTAL}
            </span>
            <span style={{ color: ACCENT }}>{trial.angle}°</span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden mb-4"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: ACCENT,
              }}
            />
          </div>

          <div
            className="flex items-center justify-center gap-3 sm:gap-6 mb-4 transition-opacity"
            style={{
              opacity: flash ? 0.55 : 1,
              outline:
                flash === "ok"
                  ? "2px solid rgba(16,185,129,0.7)"
                  : flash === "bad"
                    ? "2px solid rgba(244,63,94,0.7)"
                    : "2px solid transparent",
              borderRadius: 16,
              padding: 8,
            }}
          >
            <ShapeView
              shapeId={trial.shapeId}
              angle={0}
              mirror={false}
              label={t.mr_left}
            />
            <div className="text-slate-600 text-lg font-mono">vs</div>
            <ShapeView
              shapeId={trial.shapeId}
              angle={trial.angle}
              mirror={trial.mirror}
              label={t.mr_right}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={lockRef.current || flash != null}
              onClick={() => answer(true)}
              className="min-h-14 rounded-xl py-3 text-xs font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: "rgba(16,185,129,0.14)",
                color: "#34D399",
                border: "1px solid rgba(16,185,129,0.4)",
              }}
            >
              <Check size={16} /> {t.mr_same}
            </button>
            <button
              type="button"
              disabled={lockRef.current || flash != null}
              onClick={() => answer(false)}
              className="min-h-14 rounded-xl py-3 text-xs font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: "rgba(244,63,94,0.12)",
                color: "#FB7185",
                border: "1px solid rgba(244,63,94,0.4)",
              }}
            >
              <X size={16} /> {t.mr_mirror}
            </button>
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-slate-500 font-mono">
            <span>
              {t.mr_correct}:{" "}
              <b className="text-emerald-400">{stats.correct}</b>
            </span>
            <span>
              {t.mr_wrong}: <b className="text-rose-400">{stats.wrong}</b>
            </span>
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div
            className="text-sm font-bold tracking-widest font-mono"
            style={{ color: ACCENT }}
          >
            {saving ? t.saving : t.mr_complete}
          </div>
          <div className="text-3xl font-bold text-white tabular-nums">
            {accuracyPct}%
          </div>
          <div className="text-xs text-slate-500">
            {stats.correct}/{TOTAL} · {t.mr_correct}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={start}
            className="mt-2 w-full py-2.5 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              background: `${ACCENT}18`,
              color: ACCENT,
              border: `1px solid ${ACCENT}44`,
            }}
          >
            <RotateCcw size={14} /> {t.mr_restart}
          </button>
        </div>
      )}
    </div>
  );
}
