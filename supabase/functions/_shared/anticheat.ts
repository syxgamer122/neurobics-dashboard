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
  // Uu tien clearedLevels (so cap THUC SU vuot qua). maxLevel cu bi client nang
  // san len 1 nen van thua ngay cap 1 van bi chia cho 1.
  const rawCleared = Number(t?.clearedLevels);
  const cleared = Number.isFinite(rawCleared)
    ? rawCleared
    : Number(t?.maxLevel);

  if (!Number.isFinite(timeMs) || !Number.isFinite(cleared)) return [];
  // Chua vuot duoc cap nao => khong co "nhip do" de danh gia. Truoc day van nay
  // bi chia cho maxLevel=1 va reject 422 oan, nguoi choi mat streak/quest.
  if (cleared < 1) return [];

  // timeMs cua Memory la RECALL-ONLY (da tru pha memorize), nen nguong 1200ms
  // moi cap — dat tu thoi timeMs con la wall-clock ca van — la qua cao.
  // ~600ms cho moi cap la san hop ly cho rieng pha recall.
  const per = timeMs / cleared;
  if (per < 600)
    return [flag("Memory pace impossibly fast", "hard", { per, cleared })];
  return [];
}

/**
 * Mau 80-120ms: nhanh bat thuong nhung van trong tam nguoi that (bam
 * anticipation). Server khong con hard-reject ca van vi mot mau nhu vay — mau
 * do bi loai khoi thong ke ben round-scoring, con day chi ghi soft flag.
 */
function inspectSubThreshold(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  if (!rts.length) return [];
  const borderline = rts.filter((r) => r >= HUMAN_FLOOR_MS && r < 120);
  if (!borderline.length) return [];
  // Mot vai mau thi binh thuong; qua nua so mau duoi 120ms moi dang ngo.
  const share = borderline.length / rts.length;
  if (share < 0.5) return [];
  return [
    flag("Majority of reaction times below 120ms", "soft", {
      borderline: borderline.length,
      total: rts.length,
    }),
  ];
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

function inspectGoNoGo(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  const out: CheatFlag[] = [];
  if (rts.length >= 3) {
    const med = median(rts);
    // Choice RT chậm hơn simple RT; median < 160ms gần như không thể.
    if (med < 160)
      out.push(flag("Go/No-Go median impossibly low", "hard", { med }));
    if (cv(rts) < ROBOT_CV)
      out.push(flag("Go/No-Go timing too metronomic", "soft", { cv: cv(rts) }));
  }
  const fa = Number(t?.falseAlarms);
  const hits = Number(t?.hits);
  const goTrials = Number(t?.goTrials);
  const nogoTrials = Number(t?.nogoTrials);
  // 0 FA + 100% hit trên mẫu đủ lớn: có thể thật nhưng ghi soft để theo dõi.
  if (
    Number.isFinite(fa) &&
    Number.isFinite(hits) &&
    Number.isFinite(goTrials) &&
    Number.isFinite(nogoTrials) &&
    nogoTrials >= 8 &&
    goTrials >= 16 &&
    fa === 0 &&
    hits === goTrials &&
    rts.length >= 12 &&
    median(rts) < 220
  ) {
    out.push(
      flag("Perfect inhibition with very fast Go RTs", "soft", {
        med: median(rts),
        hits,
        fa,
      }),
    );
  }
  return out;
}

function inspectMental(t: any): CheatFlag[] {
  const rts = nums(t?.rts);
  const out: CheatFlag[] = [];
  if (rts.length >= 4) {
    const med = median(rts);
    // So khớp hình 2D: median < 250ms gần như không đọc được hình.
    if (med < 250)
      out.push(flag("Mental Rotation median impossibly low", "hard", { med }));
    if (cv(rts) < ROBOT_CV)
      out.push(
        flag("Mental Rotation timing too metronomic", "soft", { cv: cv(rts) }),
      );
  }
  const correct = Number(t?.correct);
  const trials = Number(t?.trials);
  if (
    Number.isFinite(correct) &&
    Number.isFinite(trials) &&
    trials >= 16 &&
    correct === trials &&
    rts.length >= 12 &&
    median(rts) < 450
  ) {
    out.push(
      flag("Perfect mental rotation finished too fast", "soft", {
        med: median(rts),
        correct,
        trials,
      }),
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
    ...inspectSubThreshold(t),
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
                  : game === "gonogo"
                    ? inspectGoNoGo(t)
                    : game === "mental"
                      ? inspectMental(t)
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
