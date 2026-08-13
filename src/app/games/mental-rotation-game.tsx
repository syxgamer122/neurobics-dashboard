import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, RotateCcw, X } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useGameLifecycle } from "../lib/use-game-lifecycle";
import { usePress, type InputType } from "../lib/use-press";
import type { MentalRotationTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Mental Rotation (2D) ───────────────────────────────────────────────────
// Hai hình polyomino: hình phải = xoay (SAME) hoặc gương + xoay (MIRROR).
// Xoay/gương dùng SVG transform (không tự nhân ma trận từng điểm) → T/L/F
// không bị "méo" cảm giác khi quay.
// Spatial chính; Speed phụ. Server chấm lại toàn bộ.

const TOTAL = 24;
const ACCENT = "#22D3EE";
/** Góc 45° bước — dễ đọc hơn 60° với hình block. */
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const CELL = 18; // px / ô lưới trong viewBox local
const VIEW = 140;

type Phase = "idle" | "playing" | "done";

type Trial = {
  angle: number;
  mirror: boolean;
  shapeId: number;
};

const panelStyle: React.CSSProperties = {
  background: "rgba(var(--neuro-panel-rgb),0.62)",
  border: `1px solid ${ACCENT}33`,
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
  boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
};

/**
 * Mỗi shape = danh sách ô [col, row] trên lưới (polyomino).
 * Gốc (0,0) góc trên-trái bounding box; sẽ được căn giữa khi vẽ.
 * Chỉ dùng hình BẤT ĐỐI XỨNG qua trục dọc — nếu gương trùng gốc thì trial vô nghĩa.
 */
type Cell = readonly [number, number];

const SHAPE_CELLS: Cell[][] = [
  // T lệch (phá đối xứng bằng 1 ô)
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
    [1, 2],
    [2, 2],
  ],
  // L
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  // J (gương L — khác shapeId, vẫn asymmetric)
  [
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  // S
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [0, 2],
  ],
  // Z
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 2],
  ],
  // F pentomino
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  // P / F ngắn
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
  ],
  // N / skewed
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [0, 3],
  ],
  // W pentomino
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
    [2, 2],
  ],
  // Z dài
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 2],
    [3, 2],
  ],
  // L nghiêng 6 ô
  [
    [0, 1],
    [1, 1],
    [1, 2],
    [2, 0],
    [2, 1],
    [3, 0],
  ],
  // Plus lệch (không đối xứng)
  [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
    [1, 3],
    [2, 3],
  ],
  // Stairs 4
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 3],
  ],
  // Hook
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
  ],
  // Gun / P long
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [0, 3],
  ],
  // Corner thick
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
];

function cellsToPath(cells: Cell[]): {
  d: string;
  width: number;
  height: number;
} {
  const set = new Set(cells.map(([c, r]) => `${c},${r}`));
  let maxC = 0;
  let maxR = 0;
  for (const [c, r] of cells) {
    if (c > maxC) maxC = c;
    if (r > maxR) maxR = r;
  }
  const w = maxC + 1;
  const h = maxR + 1;

  // Vẽ từng ô vuông (union visual). Dùng path M/L/Z cho mỗi ô — đơn giản, rõ block.
  const parts: string[] = [];
  const s = CELL;
  const pad = 1; // khe mỏng giữa ô → nhìn polyomino rõ khi xoay
  for (const [c, r] of cells) {
    if (!set.has(`${c},${r}`)) continue;
    const x = c * s + pad;
    const y = r * s + pad;
    const ew = s - pad * 2;
    const eh = s - pad * 2;
    parts.push(`M${x} ${y}h${ew}v${eh}h${-ew}z`);
  }
  return { d: parts.join(""), width: w * s, height: h * s };
}

const SHAPE_PATHS = SHAPE_CELLS.map(cellsToPath);

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildTrials(total: number): Trial[] {
  const mirrors = Array.from(
    { length: total },
    (_, i) => i < Math.floor(total / 2),
  );
  shuffleInPlace(mirrors);

  // Pre-generate angles and shapes separately to avoid correlation with mirror status
  const angles = Array.from(
    { length: total },
    () => ANGLES[Math.floor(Math.random() * ANGLES.length)],
  );
  const shapes = Array.from({ length: total }, () =>
    Math.floor(Math.random() * SHAPE_PATHS.length),
  );

  return mirrors.map((mirror, i) => ({
    mirror,
    angle: angles[i],
    shapeId: shapes[i],
  }));
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
  const shape = SHAPE_PATHS[shapeId] ?? SHAPE_PATHS[0];
  const cx = VIEW / 2;
  const cy = VIEW / 2;
  // Căn giữa shape trong viewBox, rồi scale X = -1 nếu gương, rồi rotate.
  // Thứ tự SVG (phải→trái): translate → rotate → scale → translate về tâm shape.
  const ox = shape.width / 2;
  const oy = shape.height / 2;
  const sx = mirror ? -1 : 1;
  const transform = `translate(${cx} ${cy}) rotate(${angle}) scale(${sx} 1) translate(${-ox} ${-oy})`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-2xl flex items-center justify-center shrink-0"
        style={{
          width: "min(42vw, 148px)",
          height: "min(42vw, 148px)",
          background: "rgba(var(--neuro-ink-rgb),0.75)",
          border: `1px solid ${ACCENT}33`,
          boxShadow: `inset 0 0 24px ${ACCENT}14`,
        }}
      >
        <svg
          width={VIEW}
          height={VIEW}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          aria-hidden
        >
          {/* Chấm tâm nhẹ — neo định hướng khi xoay */}
          <circle cx={cx} cy={cy} r={1.5} fill="rgba(148,163,184,0.35)" />
          <g transform={transform}>
            <path
              d={shape.d}
              fill={`${ACCENT}55`}
              stroke={ACCENT}
              strokeWidth={2}
              strokeLinejoin="miter"
              strokeLinecap="square"
            />
          </g>
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
  const press = usePress();
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
  const inputTypesRef = useRef<Set<InputType>>(new Set());
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
      let finalInput = "mouse";
      if (inputTypesRef.current.has("touch")) finalInput = "touch";
      else if (inputTypesRef.current.has("key")) finalInput = "key";

      await onComplete({
        timeMs: Math.max(
          1,
          rtsRef.current.reduce((a, b) => a + b, 0),
        ),
        trials: TOTAL,
        correct: s.correct,
        wrong: s.wrong,
        angles: [...anglesRef.current],
        mirrors: [...mirrorsRef.current],
        correctFlags: [...correctFlagsRef.current],
        rts: [...rtsRef.current],
        inputType: finalInput as InputType,
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
    inputTypesRef.current = new Set();
    statsRef.current = { correct: 0, wrong: 0 };
    setStats(statsRef.current);
    setFlash(null);
    setIdx(0);
    setPhase("playing");
    startedAtRef.current = Date.now();
    qStartRef.current = performance.now();
  };

  const answer = (same: boolean, inputType?: InputType) => {
    if (inputType) inputTypesRef.current.add(inputType);
    if (phase !== "playing" || lockRef.current || finishedRef.current) return;

    const trial = trialsRef.current[idx];
    if (!trial) return;

    lockRef.current = true;

    // SAME = không gương; MIRROR = gương.
    const isSame = !trial.mirror;
    const ok = same === isSame;
    const rawRt = Math.max(1, Math.round(performance.now() - qStartRef.current));
    const rt = Math.min(10000, Math.max(120, rawRt));

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
    const n = stats.correct + stats.wrong;
    if (!n) return 0;
    return Math.round((stats.correct / n) * 100);
  }, [stats]);

  const answerRef = useRef(answer);
  answerRef.current = answer;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;

      if (phase !== "playing" || lockRef.current) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        answerRef.current(true, "key");
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        answerRef.current(false, "key");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase]);

  useGameLifecycle({
    isActive: () => phase === "playing",
    onLeave: () => {
      // Could pause, but since mental rotation is sequence based without timer limit
      // we can just let it sit, or we could reset. We will leave it as is to just pause clock.
      // Wait, qStartRef is used. We should probably just let it reset or ignore.
      // Resetting is safest for data purity.
      clearFlashTimer();
      setPhase("idle");
    }
  });

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
          <div className="text-base font-bold text-foreground">
            Mental Rotation
          </div>
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
              background: "rgba(var(--neuro-ink-rgb),0.55)",
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
            <span style={{ color: ACCENT }}>· · ·</span>
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
                  ? "2px solid rgba(var(--neuro-green-rgb),0.7)"
                  : flash === "bad"
                    ? "2px solid rgba(var(--neuro-red-rgb),0.7)"
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
              disabled={!!flash}
              {...press((type: InputType) => answer(true, type))}
              className="min-h-14 rounded-xl py-3 text-xs font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 game-surface active:scale-95"
              style={{
                background: "rgba(var(--neuro-green-rgb),0.14)",
                color: "#34D399",
                border: "1px solid rgba(var(--neuro-green-rgb),0.4)",
              }}
            >
              <Check size={16} /> {t.mr_same}
            </button>
            <button
              type="button"
              disabled={!!flash}
              {...press((type: InputType) => answer(false, type))}
              className="min-h-14 rounded-xl py-3 text-xs font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 game-surface active:scale-95"
              style={{
                background: "rgba(var(--neuro-red-rgb),0.12)",
                color: "#FB7185",
                border: "1px solid rgba(var(--neuro-red-rgb),0.4)",
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
          <div className="text-3xl font-bold text-foreground tabular-nums">
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

