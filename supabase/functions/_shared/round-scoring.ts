// Server-side source of truth for round validation and cognitive scoring.
export type Game = "schulte" | "sudoku" | "stroop" | "reaction" | "memory";
export type AxisRatings = {
  speed: number | null;
  focus: number | null;
  spatial: number | null;
  logic: number | null;
  memory: number | null;
};
export type ScoredRound = {
  axes: AxisRatings;
  headline: number;
  label: string;
  timeMs: number;
};

const NO_AXES: AxisRatings = {
  speed: null,
  focus: null,
  spatial: null,
  logic: null,
  memory: null,
};
const MAX = 1000;
const clamp = (n: number) => Math.max(0, Math.min(MAX, Math.round(n)));
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const finite = (n: unknown, name: string, min = 0, max = 7_200_000): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < min || v > max)
    throw new Error(`Invalid ${name}`);
  return v;
};
const int = (n: unknown, name: string, min = 0, max = 10_000) =>
  Math.round(finite(n, name, min, max));
const numberArray = (
  v: unknown,
  name: string,
  minLength: number,
  maxLength: number,
): number[] => {
  if (!Array.isArray(v) || v.length < minLength || v.length > maxLength)
    throw new Error(`Invalid ${name} length`);
  // Lần nhập đầu tiên có thể bằng 0ms nếu xảy ra trong cùng một clock tick.
// Chuẩn hóa thành 1ms thay vì từ chối toàn bộ kết quả ván.
return v.map((x, i) =>
  Math.max(1, finite(x, `${name}[${i}]`, 0, 3_600_000)),
);
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) =>
  xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const cv = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  if (m <= 0) return 0;
  return (
    Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) / m
  );
};
const lapseRate = (xs: number[]) => {
  if (xs.length < 3) return 0;
  const m = median(xs);
  return xs.filter((x) => x > m * 2.5).length / xs.length;
};
const ratio = (target: number, actual: number) =>
  Math.min(target / Math.max(actual, 1), 1.4);
const speed = (
  rts: number[],
  target: number,
  diff: number,
  fallback?: number,
) => {
  const m = rts.length ? median(rts) : (fallback ?? 0);
  return m > 0 ? clamp(MAX * diff * ratio(target, m)) : 0;
};
const focus = (rts: number[], accuracy: number, diff: number) => {
  const penalty = clamp01((cv(rts) - 0.25) / (1.2 - 0.25));
  return clamp(
    MAX * diff * (1 - penalty * 0.6) * (1 - lapseRate(rts)) * accuracy,
  );
};
const headline = (axes: AxisRatings) =>
  Math.max(0, ...Object.values(axes).filter((v): v is number => v !== null));

const SCHULTE_DIFF: Record<number, number> = {
  9: 0.55,
  16: 0.72,
  25: 0.86,
  36: 1,
};
const SCHULTE_TARGET: Record<number, number> = {
  9: 20000,
  16: 45000,
  25: 90000,
  36: 160000,
};
const SUDOKU_DIFF: Record<string, number> = {
  Easy: 0.5,
  Medium: 0.6,
  Hard: 0.7,
  Expert: 0.8,
  Master: 0.9,
  Extreme: 1,
};
const SUDOKU_TARGET: Record<string, number> = {
  Easy: 240000,
  Medium: 360000,
  Hard: 480000,
  Expert: 720000,
  Master: 960000,
  Extreme: 1500000,
};

function scoreSchulte(t: any): ScoredRound {
  const cells = int(t?.cells, "cells", 9, 36);
  if (![9, 16, 25, 36].includes(cells)) throw new Error("Invalid Schulte size");
  const timeMs = finite(t?.timeMs, "timeMs", 500, 3_600_000);
  const rts = numberArray(t?.hitRts, "hitRts", cells, cells);
  const wrong = int(t?.wrongClicks, "wrongClicks", 0, 500);
  const diff = SCHULTE_DIFF[cells];
  const per = SCHULTE_TARGET[cells] / cells;
  const accuracy = cells / (cells + wrong);
  const late = rts.slice(Math.floor((rts.length * 2) / 3));
  const spatial = clamp(MAX * diff * ratio(per * 1.6, median(late)) * accuracy);
  const axes = {
    ...NO_AXES,
    speed: speed(rts, per, diff, timeMs / cells),
    focus: focus(rts, accuracy, diff),
    spatial,
  };
  return {
    axes,
    headline: headline(axes),
    label: String(t?.modeLabel ?? `${Math.sqrt(cells)}×${Math.sqrt(cells)}`),
    timeMs,
  };
}
function scoreSudoku(t: any): ScoredRound {
  const difficulty = String(t?.difficulty ?? "");
  if (!(difficulty in SUDOKU_DIFF))
    throw new Error("Invalid Sudoku difficulty");
  const timeMs = finite(t?.timeMs, "timeMs", 2_000, 7_200_000);
  const placements = int(t?.placements, "placements", 1, 81);
  const rts = numberArray(t?.moveRts, "moveRts", placements, placements + 3);
  const mistakes = int(t?.mistakes, "mistakes", 0, 3);
  const reEntries = int(t?.reEntries, "reEntries", 0, 100);
  const repeat = int(t?.repeatMistakes, "repeatMistakes", 0, 100);
  const diff = SUDOKU_DIFF[difficulty],
    per = SUDOKU_TARGET[difficulty] / placements;
  const logic = clamp(MAX * diff * (1 - clamp01(mistakes / 3)));
  const retention =
    1 - clamp01((reEntries + repeat * 1.5) / Math.max(4, placements * 0.25));
  const axes = {
    ...NO_AXES,
    speed: speed(rts, per, diff, timeMs / placements),
    logic,
    memory: clamp(MAX * diff * retention),
  };
  return { axes, headline: headline(axes), label: difficulty, timeMs };
}
function scoreStroop(t: any): ScoredRound {
  const total = int(t?.totalStimuli, "totalStimuli", 20, 20);
  const wrong = int(t?.wrongClicks, "wrongClicks", 0, 3);
  const correct = total - wrong;
  const rts = numberArray(t?.rts, "rts", Math.max(1, correct), total);
  const timeMs = finite(t?.timeMs, "timeMs", 1_000, 600_000);
  const accuracy = total / (total + wrong);
  const axes = {
    ...NO_AXES,
    speed: speed(rts, 1800, 0.82, timeMs / total),
    focus: focus(rts, accuracy, 0.82),
  };
  return { axes, headline: headline(axes), label: "Stroop Test", timeMs };
}
function scoreReaction(t: any): ScoredRound {
  const rts = numberArray(t?.rts, "rts", 5, 5);
  const falseStarts = int(t?.falseStarts, "falseStarts", 0, 50);
  const timeMs = finite(t?.timeMs, "timeMs", 5, 60_000);
  const accuracy = rts.length / (rts.length + falseStarts);
  const axes = {
    ...NO_AXES,
    speed: speed(rts, 350, 1),
    focus: focus(rts, accuracy, 0.9),
  };
  return { axes, headline: headline(axes), label: "Reaction Time", timeMs };
}
function scoreMemory(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 2_000, 7_200_000);
  const level = int(t?.maxLevel, "maxLevel", 1, 100);
  const wrong = int(t?.wrongClicks, "wrongClicks", 1, 100);
  const progression = clamp01(level / 12),
    cells = Math.max(1, Math.round(level * 3)),
    accuracy = cells / (cells + wrong);
  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * 0.9 * progression * accuracy),
    spatial: clamp(MAX * 0.7 * progression * accuracy),
  };
  return { axes, headline: headline(axes), label: `Level ${level}`, timeMs };
}

export function scoreAndValidate(
  game: Game,
  telemetry: unknown,
  serverElapsedMs: number,
): ScoredRound {
  if (
    !Number.isFinite(serverElapsedMs) ||
    serverElapsedMs < 500 ||
    serverElapsedMs > 2 * 60 * 60 * 1000
  )
    throw new Error("Round duration is invalid or expired");
  const scored =
    game === "schulte"
      ? scoreSchulte(telemetry)
      : game === "sudoku"
        ? scoreSudoku(telemetry)
        : game === "stroop"
          ? scoreStroop(telemetry)
          : game === "reaction"
            ? scoreReaction(telemetry)
            : scoreMemory(telemetry);
  // Client time may exclude fixed animations/wait periods. It may not exceed server elapsed by >15s.
  if (scored.timeMs > serverElapsedMs + 15_000)
    throw new Error("Telemetry time exceeds server round time");
  return scored;
}
