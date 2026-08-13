import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Play, Target } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useGameLifecycle } from "../lib/use-game-lifecycle";
import { usePress, type InputType } from "../lib/use-press";
import type { NBackTelemetry } from "../lib/scoring";

// ─── N-Back ───────────────────────────────────────────────────────────────
// Một ô sáng lên trong lưới 3×3 mỗi lượt. Người chơi bấm KHỚP khi ô hiện tại
// trùng với ô đã hiện N lượt trước đó. Đây là bài đo working memory tiêu
// chuẩn trong tâm lý học nhận thức.
//
// Toàn bộ điểm được chấm lại ở server; ở đây chỉ thu thập số liệu thô.

const GRID = 9;
const TRIALS = 24;
/** Tổng thời lượng một lượt. */
const STEP_MS = 2500;
/** Thời gian ô sáng, phần còn lại là khoảng trống để trả lời. */
const SHOW_MS = 850;
/** Tỷ lệ lượt cố tình tạo trùng khớp. */
const TARGET_RATE = 0.3;

// Them 5-back va 6-back: nguoi choi cao cap khong cham tran o n=4.
const LEVELS = [2, 3, 4, 5, 6] as const;

const panelStyle: React.CSSProperties = {
  background: "rgba(var(--neuro-ink-rgb),0.55)",
  border: "1px solid rgba(var(--neuro-purple-rgb),0.18)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

/** Chuỗi vị trí có khoảng 30% lượt trùng khớp, phần còn lại chắc chắn không trùng. */
function buildSequence(n: number, trials: number): number[] {
  const seq: number[] = [];

  // Decide which indices will be targets. The first n indices cannot be targets.
  const targetCount = Math.round((trials - n) * TARGET_RATE);
  const possibleIndices = [];
  for (let i = n; i < trials; i++) {
    possibleIndices.push(i);
  }

  // Shuffle possibleIndices
  for (let i = possibleIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [possibleIndices[i], possibleIndices[j]] = [
      possibleIndices[j],
      possibleIndices[i],
    ];
  }
  const targetIndices = new Set(possibleIndices.slice(0, targetCount));

  for (let i = 0; i < trials; i++) {
    if (targetIndices.has(i)) {
      seq.push(seq[i - n]);
      continue;
    }
    let cell = Math.floor(Math.random() * GRID);
    // Tránh tạo trùng khớp ngoài ý muốn ở những lượt đáng lẽ không phải mục tiêu.
    if (i >= n && cell === seq[i - n]) cell = (cell + 1) % GRID;
    seq.push(cell);
  }
  return seq;
}

export function NBackGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (telemetry: NBackTelemetry) => void;
  onPlayStart?: () => void;
}) {
  const press = usePress();
  const { t } = useLang();
  // Chuoi lay tu i18n.tsx; giu ten `s` de khong phai doi het cho dung.
  const s = {
    tag: t.nback_tag,
    desc: t.nback_hint,
    level: t.nback_level,
    start: t.nback_start,
    match: t.nback_match,
    trial: t.nback_trial,
    hit: t.nback_hit,
    miss: t.nback_miss,
    false: t.nback_false,
    watch: t.nback_watch,
  };

  const [n, setN] = useState<number>(2);
  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [trial, setTrial] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [stats, setStats] = useState({ hits: 0, misses: 0, falseAlarms: 0 });

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const seqRef = useRef<number[]>([]);
  const respondedRef = useRef(false);
  const trialStartRef = useRef(0);
  const startedAtRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const inputTypesRef = useRef<Set<InputType>>(new Set());
  const statsRef = useRef({ hits: 0, misses: 0, falseAlarms: 0 });
  const finishedRef = useRef(false);

  const resetGame = () => {
    setPhase("idle");
    setActive(null);
    finishedRef.current = true;
  };

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("idle");
    setActive(null);

    let finalInput = "mouse";
    if (inputTypesRef.current.has("touch")) finalInput = "touch";
    else if (inputTypesRef.current.has("key")) finalInput = "key";

    onComplete({
      timeMs: Math.max(
        1,
        rtsRef.current.reduce((a, b) => a + b, 0),
      ),
      n,
      trials: TRIALS,
      hits: statsRef.current.hits,
      misses: statsRef.current.misses,
      falseAlarms: statsRef.current.falseAlarms,
      rts: rtsRef.current,
      inputType: finalInput as InputType,
    });
  }, [n, onComplete]);

  useGameLifecycle({
    isActive: () => phaseRef.current === "playing",
    onLeave: resetGame,
  });

  // Vòng lặp lượt chơi: mỗi lượt tự hẹn giờ tắt ô và chuyển lượt kế tiếp.
  useEffect(() => {
    if (phase !== "playing") return;

    if (trial >= TRIALS) {
      finish();
      return;
    }

    const seq = seqRef.current;
    respondedRef.current = false;
    trialStartRef.current = performance.now();
    setActive(seq[trial]);

    const hideTimer = window.setTimeout(() => setActive(null), SHOW_MS);
    const nextTimer = window.setTimeout(() => {
      // Hết giờ mà không bấm: nếu đây đúng là lượt trùng khớp thì tính bỏ lỡ.
      const isTarget = trial >= n && seq[trial] === seq[trial - n];
      if (!respondedRef.current && isTarget) {
        statsRef.current = {
          ...statsRef.current,
          misses: statsRef.current.misses + 1,
        };
        setStats(statsRef.current);
      }
      setFlash(null);
      setTrial((prev) => prev + 1);
    }, STEP_MS);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(nextTimer);
    };
  }, [phase, trial, n, finish]);

  const start = () => {
    onPlayStart?.();
    seqRef.current = buildSequence(n, TRIALS);
    rtsRef.current = [];
    inputTypesRef.current = new Set();
    statsRef.current = { hits: 0, misses: 0, falseAlarms: 0 };
    finishedRef.current = false;
    startedAtRef.current = Date.now();
    setStats(statsRef.current);
    setFlash(null);
    setTrial(0);
    setPhase("playing");
  };

  const handlePress = (inputType?: InputType) => {
    if (inputType) inputTypesRef.current.add(inputType);
    if (phase !== "playing") return;
    // Mỗi lượt chỉ nhận một phản hồi, bấm thêm không bị tính là bấm nhầm.
    // trial < n là warmup: chưa thể có target nên không tính false alarm.
    // Nút MATCH đã disabled, chặn luôn ở đây cho phím Space.
    if (phase !== "playing" || respondedRef.current || trial < n) return;
    respondedRef.current = true;

    const seq = seqRef.current;
    const isTarget = trial >= n && seq[trial] === seq[trial - n];

    if (isTarget) {
      const rawRt = performance.now() - trialStartRef.current;
      rtsRef.current.push(Math.min(10000, Math.max(120, rawRt)));
      statsRef.current = {
        ...statsRef.current,
        hits: statsRef.current.hits + 1,
      };
    } else {
      statsRef.current = {
        ...statsRef.current,
        falseAlarms: statsRef.current.falseAlarms + 1,
      };
    }
    setStats(statsRef.current);
    setFlash(isTarget ? "ok" : "bad");
  };

  // Phím cách để bấm khớp cho nhanh tay.
  // Handler đọc press() qua ref => listener chỉ gắn/gỡ khi đổi phase.
  const pressRef = useRef(handlePress);
  pressRef.current = handlePress;
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        pressRef.current("key");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const warmup = phase === "playing" && trial < n;

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center gap-2 mb-1">
        <Brain size={16} style={{ color: "#A855F7" }} />
        <span
          className="text-xs tracking-[0.25em] uppercase font-mono"
          style={{ color: "#A855F7" }}
        >
          {s.tag}
        </span>
      </div>
      <div className="text-foreground text-lg mb-1">N-Back</div>
      <p className="text-xs text-foreground/50 mb-4">{s.desc}</p>

      {phase === "idle" && (
        <>
          <div className="text-xs text-foreground/40 mb-2 tracking-widest uppercase font-mono">
            {s.level}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setN(lv)}
                className="py-2 rounded-xl text-xs transition-all"
                style={{
                  background:
                    n === lv
                      ? "rgba(var(--neuro-purple-rgb),0.18)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    n === lv
                      ? "rgba(var(--neuro-purple-rgb),0.5)"
                      : "rgba(255,255,255,0.08)"
                  }`,
                  color: n === lv ? "#A855F7" : "rgba(255,255,255,0.55)",
                }}
              >
                {lv}-Back
              </button>
            ))}
          </div>
          <button
            onClick={start}
            className="w-full py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2 font-mono"
            style={{
              background: "rgba(var(--neuro-purple-rgb),0.15)",
              border: "1px solid rgba(var(--neuro-purple-rgb),0.45)",
              color: "#A855F7",
            }}
          >
            <Play size={13} /> {s.start}
          </button>
        </>
      )}

      {phase === "playing" && (
        <>
          <div
            className="flex items-center justify-between text-xs mb-3"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <span>
              {s.trial} {Math.min(trial + 1, TRIALS)}/{TRIALS}
            </span>
            <span style={{ color: "#A855F7" }}>{n}-Back</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {Array.from({ length: GRID }, (_, i) => {
              const on = active === i;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-xl transition-all duration-150"
                  style={{
                    background: on
                      ? "rgba(var(--neuro-purple-rgb),0.55)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${
                      on
                        ? "rgba(var(--neuro-purple-rgb),0.9)"
                        : "rgba(255,255,255,0.07)"
                    }`,
                    boxShadow: on
                      ? "0 0 22px rgba(var(--neuro-purple-rgb),0.5)"
                      : "none",
                  }}
                />
              );
            })}
          </div>

          <button
            {...press((type: InputType) => handlePress(type))}
            disabled={warmup}
            className="w-full py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2 transition-all font-mono game-surface active:scale-95"
            style={{
              opacity: warmup ? 0.4 : 1,
              background:
                flash === "ok"
                  ? "rgba(var(--neuro-green-rgb),0.2)"
                  : flash === "bad"
                    ? "rgba(var(--neuro-red-rgb),0.2)"
                    : "rgba(var(--neuro-purple-rgb),0.15)",
              border: `1px solid ${
                flash === "ok"
                  ? "rgba(var(--neuro-green-rgb),0.5)"
                  : flash === "bad"
                    ? "rgba(var(--neuro-red-rgb),0.5)"
                    : "rgba(var(--neuro-purple-rgb),0.45)"
              }`,
              color:
                flash === "ok"
                  ? "#10B981"
                  : flash === "bad"
                    ? "#F43F5E"
                    : "#A855F7",
            }}
          >
            <Target size={13} /> {warmup ? s.watch : s.match}
          </button>

          <div
            className="flex justify-between text-xs mt-3"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <span style={{ color: "#10B981" }}>
              {s.hit} {stats.hits}
            </span>
            <span style={{ color: "#F59E0B" }}>
              {s.miss} {stats.misses}
            </span>
            <span style={{ color: "#F43F5E" }}>
              {s.false} {stats.falseAlarms}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
