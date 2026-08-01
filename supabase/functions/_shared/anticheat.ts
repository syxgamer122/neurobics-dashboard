// Server-side anti-cheat inspectors.
// Principle: better to miss a cheater than ban an innocent player ("tha lot con hon bat oan").
// Hard flags reject the round. Soft flags still accept but record trust damage.

export type CheatSeverity = "soft" | "hard";

export type CheatFlag = {
  msg: string;
  severity: CheatSeverity;
  detail?: Record<string, unknown>;
};

export type CheatReport = {
  flags: CheatFlag[];
};

const HUMAN_FLOOR_MS = 80;
const ROBOT_CV = 0.04;

const nums = (v: unknown): number[] =>
  Array.isArray(v)
    ? v.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
    : [];

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const cv = (xs: number[]): number => {
  if (xs.length < 4) return 1;
  const m = mean(xs);
  if (m <= 0) return 0;
  const sd = Math.sqrt(
    xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1),
  );
  return sd / m;
};

const flag = (
  msg: string,
  severity: CheatSeverity,
  detail?: Record<string, unknown>,
): CheatFlag => ({ msg, severity, detail });

function inspectShared(
  t: any,
  serverElapsedMs: number,
): CheatFlag[] {
  const out: CheatFlag[] = [];
  const timeMs = Number(t?.timeMs);
  if (Number.isFinite(timeMs) && timeMs - serverElapsedMs > 5000) {
    out.push(
      flag("Client time far exceeds server elapsed", "soft", {
        timeMs,
        serverElapsedMs,
      }),
    );
  }
  return out;
}

function inspectReaction(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 3) return [];
  const out: CheatFlag[] = [];
  const min = Math.min(...rts);
  const med = median(rts);
  if (min < HUMAN_FLOOR_MS)
    out.push(flag("Reaction faster than human floor", "hard", { min }));
  if (med < 130)
    out.push(flag("Reaction median impossibly low", "hard", { med }));
  if (cv(rts) < ROBOT_CV)
    out.push(flag("Reaction timing too metronomic", "soft", { cv: cv(rts) }));
  return out;
}

function inspectSchulte(t: any): CheatFlag[] {
  const rts = nums(t?.hitRts);
  if (rts.length < 4) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  if (med < 150)
    out.push(flag("Schulte hit median impossibly low", "hard", { med }));
  if (cv(rts) < ROBOT_CV)
    out.push(flag("Schulte timing too metronomic", "soft", { cv: cv(rts) }));
  return out;
}

function inspectStroop(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 4) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  if (med < 200)
    out.push(flag("Stroop median impossibly low", "hard", { med }));
  if (cv(rts) < ROBOT_CV)
    out.push(flag("Stroop timing too metronomic", "soft", { cv: cv(rts) }));
  return out;
}

function inspectSudoku(t: any): CheatFlag[] {
  const rts = nums(t?.moveRts);
  const out: CheatFlag[] = [];
  if (rts.length >= 5) {
    const med = median(rts);
    if (med < 120)
      out.push(flag("Sudoku move median impossibly low", "hard", { med }));
    if (cv(rts) < ROBOT_CV)
      out.push(flag("Sudoku timing too metronomic", "soft", { cv: cv(rts) }));
  }
  const timeMs = Number(t?.timeMs);
  const diff = String(t?.difficulty ?? "");
  if (
    Number.isFinite(timeMs) &&
    (diff === "Master" || diff === "Extreme") &&
    timeMs < 45_000
  ) {
    out.push(
      flag("Sudoku expert board finished too fast", "soft", { timeMs, diff }),
    );
  }
  return out;
}

function inspectMemory(t: any): CheatFlag[] {
  const timeMs = Number(t?.timeMs);
  const maxLevel = Number(t?.maxLevel);
  if (!Number.isFinite(timeMs) || !Number.isFinite(maxLevel) || maxLevel < 1)
    return [];
  const per = timeMs / maxLevel;
  if (per < 1200)
    return [flag("Memory pace impossibly fast", "hard", { per, maxLevel })];
  return [];
}

function inspectNBack(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 3) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  if (med < 150)
    out.push(flag("N-Back median impossibly low", "hard", { med }));
  if (cv(rts) < ROBOT_CV)
    out.push(flag("N-Back timing too metronomic", "soft", { cv: cv(rts) }));
  return out;
}

function inspectMath(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 4) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  const correct = Number(t?.correct);
  const total = Number(t?.totalProblems);
  const difficulty = String(t?.difficulty ?? "");
  if (med < 250)
    out.push(flag("Math median impossibly low", "hard", { med }));
  if (cv(rts) < ROBOT_CV)
    out.push(flag("Math timing too metronomic", "soft", { cv: cv(rts) }));
  if (
    difficulty === "hard" &&
    Number.isFinite(correct) &&
    Number.isFinite(total) &&
    correct === total &&
    med < 1200
  ) {
    out.push(
      flag("Perfect hard math finished too fast", "soft", { med, correct }),
    );
  }
  return out;
}

export function inspectRound(
  game: string,
  telemetry: unknown,
  serverElapsedMs: number,
): CheatReport {
  const t = telemetry as any;
  const flags: CheatFlag[] = [
    ...inspectShared(t, serverElapsedMs),
    ...(game === "math"
      ? inspectMath(t)
      : game === "reaction"
        ? inspectReaction(t)
        : game === "schulte"
          ? inspectSchulte(t)
          : game === "stroop"
            ? inspectStroop(t)
            : game === "sudoku"
              ? inspectSudoku(t)
              : game === "memory"
                ? inspectMemory(t)
                : game === "nback"
                  ? inspectNBack(t)
                  : []),
  ];
  return { flags };
}

export function hasHardFlag(report: CheatReport): boolean {
  return report.flags.some((f) => f.severity === "hard");
}

export function softFlags(report: CheatReport): CheatFlag[] {
  return report.flags.filter((f) => f.severity === "soft");
}
