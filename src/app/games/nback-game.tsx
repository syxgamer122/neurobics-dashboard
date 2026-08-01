import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Play, Target } from "lucide-react";
import { useLang } from "../lib/i18n";
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

const LEVELS = [2, 3, 4] as const;

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(168,85,247,0.18)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const TXT = {
  vi: {
    tag: "TRÍ NHỚ LÀM VIỆC",
    desc: "Bấm KHỚP khi ô đang sáng trùng với ô đã hiện N lượt trước.",
    level: "Chọn độ sâu",
    start: "BẮT ĐẦU",
    match: "KHỚP",
    trial: "Lượt",
    hit: "Đúng",
    miss: "Bỏ lỡ",
    false: "Bấm nhầm",
    watch: "Ghi nhớ vị trí…",
  },
  en: {
    tag: "WORKING MEMORY",
    desc: "Press MATCH when the lit cell repeats the one from N steps back.",
    level: "Choose depth",
    start: "START",
    match: "MATCH",
    trial: "Trial",
    hit: "Hits",
    miss: "Misses",
    false: "False",
    watch: "Memorise the positions…",
  },
};

/** Chuỗi vị trí có khoảng 30% lượt trùng khớp, phần còn lại chắc chắn không trùng. */
function buildSequence(n: number, trials: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < trials; i++) {
    if (i >= n && Math.random() < TARGET_RATE) {
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
  const { lang } = useLang();
  const s = TXT[lang];

  const [n, setN] = useState<number>(2);
  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [trial, setTrial] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [stats, setStats] = useState({ hits: 0, misses: 0, falseAlarms: 0 });

  const seqRef = useRef<number[]>([]);
  const respondedRef = useRef(false);
  const trialStartRef = useRef(0);
  const startedAtRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const statsRef = useRef({ hits: 0, misses: 0, falseAlarms: 0 });
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("idle");
    setActive(null);
    onComplete({
      timeMs: Date.now() - startedAtRef.current,
      n,
      trials: TRIALS,
      hits: statsRef.current.hits,
      misses: statsRef.current.misses,
      falseAlarms: statsRef.current.falseAlarms,
      rts: rtsRef.current,
    });
  }, [n, onComplete]);

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
    statsRef.current = { hits: 0, misses: 0, falseAlarms: 0 };
    finishedRef.current = false;
    startedAtRef.current = Date.now();
    setStats(statsRef.current);
    setFlash(null);
    setTrial(0);
    setPhase("playing");
  };

  const press = () => {
    // Mỗi lượt chỉ nhận một phản hồi, bấm thêm không bị tính là bấm nhầm.
    if (phase !== "playing" || respondedRef.current) return;
    respondedRef.current = true;

    const seq = seqRef.current;
    const isTarget = trial >= n && seq[trial] === seq[trial - n];

    if (isTarget) {
      rtsRef.current.push(performance.now() - trialStartRef.current);
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
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const warmup = phase === "playing" && trial < n;

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center gap-2 mb-1">
        <Brain size={16} style={{ color: "#A855F7" }} />
        <span
          className="text-[10px] tracking-[0.25em] uppercase"
          style={{ ...mono, color: "#A855F7" }}
        >
          {s.tag}
        </span>
      </div>
      <div className="text-white text-lg mb-1">N-Back</div>
      <p className="text-[11px] text-white/50 mb-4" style={mono}>
        {s.desc}
      </p>

      {phase === "idle" && (
        <>
          <div
            className="text-[10px] text-white/40 mb-2 tracking-widest uppercase"
            style={mono}
          >
            {s.level}
          </div>
          <div className="flex gap-2 mb-4">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                onClick={() => setN(lv)}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{
                  ...mono,
                  background:
                    n === lv ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    n === lv ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.08)"
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
            className="w-full py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2"
            style={{
              ...mono,
              background: "rgba(168,85,247,0.15)",
              border: "1px solid rgba(168,85,247,0.45)",
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
            className="flex items-center justify-between text-[10px] mb-3"
            style={{ ...mono, color: "rgba(255,255,255,0.45)" }}
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
                      ? "rgba(168,85,247,0.55)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${
                      on ? "rgba(168,85,247,0.9)" : "rgba(255,255,255,0.07)"
                    }`,
                    boxShadow: on ? "0 0 22px rgba(168,85,247,0.5)" : "none",
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={press}
            disabled={warmup}
            className="w-full py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2 transition-all"
            style={{
              ...mono,
              opacity: warmup ? 0.4 : 1,
              background:
                flash === "ok"
                  ? "rgba(16,185,129,0.2)"
                  : flash === "bad"
                    ? "rgba(244,63,94,0.2)"
                    : "rgba(168,85,247,0.15)",
              border: `1px solid ${
                flash === "ok"
                  ? "rgba(16,185,129,0.5)"
                  : flash === "bad"
                    ? "rgba(244,63,94,0.5)"
                    : "rgba(168,85,247,0.45)"
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
            className="flex justify-between text-[10px] mt-3"
            style={{ ...mono, color: "rgba(255,255,255,0.4)" }}
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
