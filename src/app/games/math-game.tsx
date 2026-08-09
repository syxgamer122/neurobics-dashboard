import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, Check, Play, X } from "lucide-react";
import { useLang } from "../lib/i18n";
import type { MathDifficulty, MathTelemetry } from "../lib/scoring";

// ─── Math Sprint ──────────────────────────────────────────────────────────
// 24 phép tính, mỗi câu 4 đáp án. Đo logic (đúng/sai) + tốc độ (độ trễ từng câu).
// Che do adaptive: 8 de + 8 vua + 8 kho trong cung mot van.
// Toàn bộ điểm được chấm lại ở server; client chỉ thu thập số liệu thô.

const TOTAL = 24;
const ACCENT = "#38BDF8";

const panelStyle: React.CSSProperties = {
  background: "rgba(var(--neuro-ink-rgb),0.55)",
  border: `1px solid ${ACCENT}2E`,
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

type Problem = {
  prompt: string;
  answer: number;
  choices: number[];
};

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueChoices(correct: number, raw: number[]): number[] {
  const set = new Set<number>([correct]);
  for (const n of raw) {
    if (!Number.isFinite(n) || n === correct) continue;
    set.add(Math.trunc(n));
    if (set.size >= 4) break;
  }
  // Đủ 4 lựa chọn kể cả khi số nhiễu trùng nhau.
  let bump = 1;
  while (set.size < 4) {
    set.add(correct + bump);
    bump = bump > 0 ? -bump : -bump + 1;
  }
  return shuffle([...set]).slice(0, 4);
}

function makeProblem(diff: MathDifficulty): Problem {
  if (diff === "easy") {
    const op = Math.random() < 0.55 ? "+" : "-";
    if (op === "+") {
      const a = randInt(2, 20);
      const b = randInt(2, 20);
      const answer = a + b;
      return {
        prompt: `${a} + ${b}`,
        answer,
        choices: uniqueChoices(answer, [
          answer + 1,
          answer - 1,
          answer + 10,
          a + b + 2,
          Math.abs(a - b),
        ]),
      };
    }
    const a = randInt(5, 30);
    const b = randInt(1, a - 1);
    const answer = a - b;
    return {
      prompt: `${a} − ${b}`,
      answer,
      choices: uniqueChoices(answer, [
        answer + 1,
        answer - 1,
        answer + 2,
        a + b,
        Math.abs(b - a),
      ]),
    };
  }

  if (diff === "medium") {
    const roll = Math.random();
    if (roll < 0.4) {
      const a = randInt(3, 12);
      const b = randInt(3, 12);
      const answer = a * b;
      return {
        prompt: `${a} × ${b}`,
        answer,
        choices: uniqueChoices(answer, [
          answer + a,
          answer - a,
          answer + b,
          answer - b,
          a * (b + 1),
          (a + 1) * b,
        ]),
      };
    }
    if (roll < 0.7) {
      const b = randInt(2, 12);
      const answer = randInt(2, 12);
      const a = b * answer;
      return {
        prompt: `${a} ÷ ${b}`,
        answer,
        choices: uniqueChoices(answer, [
          answer + 1,
          answer - 1,
          answer + 2,
          b,
          a - b,
        ]),
      };
    }
    const a = randInt(10, 40);
    const b = randInt(10, 40);
    const answer = a + b;
    return {
      prompt: `${a} + ${b}`,
      answer,
      choices: uniqueChoices(answer, [
        answer + 10,
        answer - 10,
        answer + 1,
        answer - 1,
        a - b,
      ]),
    };
  }

  // hard: kết hợp 2 phép hoặc nhân số lớn hơn
  const roll = Math.random();
  if (roll < 0.35) {
    const a = randInt(12, 25);
    const b = randInt(6, 18);
    const answer = a * b;
    return {
      prompt: `${a} × ${b}`,
      answer,
      choices: uniqueChoices(answer, [
        answer + a,
        answer - a,
        answer + b,
        answer - b,
        (a - 1) * b,
        a * (b + 1),
      ]),
    };
  }
  if (roll < 0.7) {
    const a = randInt(5, 20);
    const b = randInt(5, 20);
    const c = randInt(2, 12);
    const answer = a + b * c;
    return {
      prompt: `${a} + ${b} × ${c}`,
      answer,
      choices: uniqueChoices(answer, [
        (a + b) * c,
        a + b + c,
        a * b + c,
        answer + c,
        answer - b,
        a - b * c,
      ]),
    };
  }
  const a = randInt(20, 60);
  const b = randInt(3, 12);
  const c = randInt(2, 9);
  const answer = a - b * c;
  return {
    prompt: `${a} − ${b} × ${c}`,
    answer,
    choices: uniqueChoices(answer, [
      (a - b) * c,
      a - b - c,
      a + b * c,
      answer + b,
      answer - c,
      Math.abs(answer),
    ]),
  };
}

function buildSet(diff: MathDifficulty): Problem[] {
  if (diff !== "adaptive") {
    return Array.from({ length: TOTAL }, () => makeProblem(diff));
  }
  // Ramp de -> vua -> kho (8 cau moi tang). Khong doi do kho giua cau theo
  // streak thoi gian thuc de diem van so sanh duoc giua cac van adaptive.
  const out: Problem[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const tier: MathDifficulty = i < 8 ? "easy" : i < 16 ? "medium" : "hard";
    out.push(makeProblem(tier));
  }
  return out;
}

export function MathSprintGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (telemetry: MathTelemetry) => void;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  // Chuoi lay tu i18n.tsx; giu ten `s` de khong phai doi het cho dung.
  const s = {
    tag: t.math_tag,
    desc: t.math_hint,
    level: t.math_level,
    start: t.math_start,
    q: t.math_q,
    correct: t.math_correct,
    wrong: t.math_wrong,
    easy: t.math_easy,
    medium: t.math_medium,
    hard: t.math_hard,
    adaptive: t.math_adaptive,
  };

  // Khớp MIN_RT_MS trong supabase/functions/_shared/round-scoring.ts.
  const MIN_RT_MS = 120;

  const [diff, setDiff] = useState<MathDifficulty>("medium");
  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  const problemsRef = useRef<Problem[]>([]);
  const startedAtRef = useRef(0);
  const qStartRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const statsRef = useRef({ correct: 0, wrong: 0 });
  const finishedRef = useRef(false);
  const lockRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("idle");
    onComplete({
      timeMs: Date.now() - startedAtRef.current,
      difficulty: diff,
      totalProblems: TOTAL,
      correct: statsRef.current.correct,
      wrong: statsRef.current.wrong,
      rts: rtsRef.current,
    });
  }, [diff, onComplete]);

  const start = () => {
    onPlayStart?.();
    problemsRef.current = buildSet(diff);
    rtsRef.current = [];
    statsRef.current = { correct: 0, wrong: 0 };
    finishedRef.current = false;
    lockRef.current = false;
    startedAtRef.current = Date.now();
    qStartRef.current = performance.now();
    setStats(statsRef.current);
    setFlash(null);
    setIdx(0);
    setPhase("playing");
  };

  // Dọn timer flash khi rời game để không setState/finish sau unmount.
  const flashTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    },
    [],
  );

  const answer = (choice: number) => {
    if (phase !== "playing" || lockRef.current || finishedRef.current) return;
    lockRef.current = true;

    const p = problemsRef.current[idx];
    const ok = choice === p.answer;
    const rt = performance.now() - qStartRef.current;
    // Ghi mọi độ trễ (cả câu sai) để chấm tốc độ trung thực, NHƯNG phải kẹp
    // sàn: server chạy assertRtBounds() trên mảng này và từ chối cả ván nếu
    // có mẫu < MIN_RT_MS (120ms). Một cú bấm nhầm siêu nhanh không được phép
    // đánh rớt một ván hợp lệ.
    rtsRef.current.push(Math.max(MIN_RT_MS, rt));

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

    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null;
      setFlash(null);
      const next = idx + 1;
      if (next >= TOTAL) {
        finish();
        return;
      }
      setIdx(next);
      qStartRef.current = performance.now();
      lockRef.current = false;
    }, 220);
  };

  // `answer` duoc tao lai moi lan render. Dua thang vao deps thi listener bi go
  // ra / gan lai sau MOI render (lang phi, va co khe hoi mat phim); bo qua thi
  // ESLint canh bao dung. Giu ban moi nhat trong ref: listener chi gan lai khi
  // phase/idx doi, nhung luon goi dung phien ban `answer` hien tai.
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  });

  // Phím 1–4 chọn đáp án theo thứ tự hiển thị.
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = {
        Digit1: 0,
        Digit2: 1,
        Digit3: 2,
        Digit4: 3,
        Numpad1: 0,
        Numpad2: 1,
        Numpad3: 2,
        Numpad4: 3,
      };
      const i = map[e.code];
      if (i === undefined) return;
      e.preventDefault();
      const p = problemsRef.current[idx];
      if (!p) return;
      answerRef.current(p.choices[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, idx]);

  const problem = problemsRef.current[idx];
  const levels: { id: MathDifficulty; label: string }[] = [
    { id: "easy", label: s.easy },
    { id: "medium", label: s.medium },
    { id: "hard", label: s.hard },
    { id: "adaptive", label: s.adaptive },
  ];

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={16} style={{ color: ACCENT }} />
        <span
          className="text-xs tracking-[0.25em] uppercase font-mono"
          style={{ color: ACCENT }}
        >
          {s.tag}
        </span>
      </div>
      <div className="text-foreground text-lg mb-1">Math Sprint</div>
      <p className="text-xs text-foreground/50 mb-4">{s.desc}</p>

      {phase === "idle" && (
        <>
          <div className="text-xs text-foreground/40 mb-2 tracking-widest uppercase font-mono">
            {s.level}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {levels.map((lv) => (
              <button
                key={lv.id}
                type="button"
                onClick={() => setDiff(lv.id)}
                className="py-2 rounded-xl text-xs transition-all"
                style={{
                  background:
                    diff === lv.id
                      ? "rgba(56,189,248,0.18)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${
                    diff === lv.id
                      ? "rgba(56,189,248,0.5)"
                      : "rgba(255,255,255,0.08)"
                  }`,
                  color: diff === lv.id ? ACCENT : "rgba(255,255,255,0.55)",
                }}
              >
                {lv.label}
              </button>
            ))}
          </div>
          <button
            onClick={start}
            className="w-full py-3 rounded-xl text-xs tracking-widest flex items-center justify-center gap-2 font-mono"
            style={{
              background: "rgba(56,189,248,0.15)",
              border: "1px solid rgba(56,189,248,0.45)",
              color: ACCENT,
            }}
          >
            <Play size={13} /> {s.start}
          </button>
        </>
      )}

      {phase === "playing" && problem && (
        <>
          <div
            className="flex items-center justify-between text-xs mb-3"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <span>
              {s.q} {idx + 1}/{TOTAL}
            </span>
            <span style={{ color: ACCENT }}>
              {diff === "easy"
                ? s.easy
                : diff === "medium"
                  ? s.medium
                  : diff === "hard"
                    ? s.hard
                    : s.adaptive}
            </span>
          </div>

          <div
            className="rounded-2xl py-8 mb-4 text-center text-3xl font-semibold text-foreground tracking-wide transition-colors"
            style={{
              background:
                flash === "ok"
                  ? "rgba(var(--neuro-green-rgb),0.12)"
                  : flash === "bad"
                    ? "rgba(var(--neuro-red-rgb),0.12)"
                    : "rgba(255,255,255,0.03)",
              border: `1px solid ${
                flash === "ok"
                  ? "rgba(var(--neuro-green-rgb),0.45)"
                  : flash === "bad"
                    ? "rgba(var(--neuro-red-rgb),0.45)"
                    : "rgba(255,255,255,0.08)"
              }`,
            }}
          >
            <span className="inline-flex items-center justify-center gap-3">
              {/* Icon dung/sai: khong chi dua vao mau cho nguoi mu mau. */}
              {flash === "ok" && (
                <Check
                  size={26}
                  aria-label={s.correct}
                  style={{ color: "#10B981" }}
                />
              )}
              {flash === "bad" && (
                <X
                  size={26}
                  aria-label={s.wrong}
                  style={{ color: "#F43F5E" }}
                />
              )}
              <span>{problem.prompt} = ?</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {problem.choices.map((c, i) => (
              <button
                key={`${idx}-${c}-${i}`}
                onClick={() => answer(c)}
                className="py-3 rounded-xl text-sm transition-all"
                style={{
                  background: "rgba(56,189,248,0.08)",
                  border: "1px solid rgba(56,189,248,0.28)",
                  color: "#E2F6FF",
                }}
              >
                <span className="text-foreground/35 text-xs mr-2">{i + 1}</span>
                {c}
              </button>
            ))}
          </div>

          <div
            className="flex justify-between text-xs mt-3"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <span style={{ color: "#10B981" }}>
              {s.correct} {stats.correct}
            </span>
            <span style={{ color: "#F43F5E" }}>
              {s.wrong} {stats.wrong}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
