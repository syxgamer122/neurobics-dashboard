import type { Game } from "./core.ts";

// San CUNG: chi duoi nguong nay moi la phi nhan loai that su va bi tu choi.
// Khop HUMAN_FLOOR_MS trong anticheat.ts.
const HARD_MIN_RT_MS = 80;
const MAX_RT_MS = 60_000;

export function assertRtBounds(
  rts: unknown,
  serverElapsedMs: number,
  label: string,
): void {
  if (rts == null) return;
  if (!Array.isArray(rts)) throw new Error(`${label}: rts must be an array`);
  if (rts.length > 5_000) throw new Error(`${label}: too many reaction times`);
  let total = 0;
  for (const r of rts) {
    if (typeof r !== "number" || !Number.isFinite(r))
      throw new Error(`${label}: reaction time is not a number`);
    if (r < HARD_MIN_RT_MS)
      throw new Error(`${label}: reaction time below human threshold`);
    if (r > MAX_RT_MS) throw new Error(`${label}: reaction time out of range`);
    total += r;
  }
  // Tong thoi gian phan ung khong the vuot thoi gian van dau (dem bien 15s).
  if (total > serverElapsedMs + 15_000)
    throw new Error(`${label}: sum of reaction times exceeds round duration`);
}

export function assertCountBounds(game: Game, telemetry: unknown): void {
  const t = (telemetry ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = t[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const nonNeg = (k: string) => {
    const v = num(k);
    if (v !== null && v < 0)
      throw new Error(`${game}: ${k} cannot be negative`);
  };
  for (const k of [
    "wrongClicks",
    "mistakes",
    "correct",
    "wrong",
    "hits",
    "misses",
    "falseAlarms",
    "falseStarts",
    "totalStimuli",
    "trials",
    "targets",
    "maxLevel",
    "goTrials",
    "nogoTrials",
    "correctRejections",
    "span",
    "correctTrials",
    "taps",
    "nodes",
  ])
    nonNeg(k);

  const rtsLen = Array.isArray(t.rts) ? t.rts.length : null;

  if (game === "nback") {
    const trials = num("trials");
    const targets = num("targets");
    const hits = num("hits");
    const fa = num("falseAlarms");
    if (trials !== null && targets !== null && targets > trials)
      throw new Error("nback: targets exceed trials");
    if (targets !== null && hits !== null && hits > targets)
      throw new Error("nback: hits exceed targets");
    if (trials !== null && fa !== null && fa > trials)
      throw new Error("nback: false alarms exceed trials");
    if (trials !== null && rtsLen !== null && rtsLen > trials)
      throw new Error("nback: more reaction times than trials");
  }

  if (game === "math") {
    const correct = num("correct");
    const wrong = num("wrong");
    const total = num("total");
    if (
      correct !== null &&
      wrong !== null &&
      total !== null &&
      correct + wrong > total
    )
      throw new Error("math: answered more problems than served");
    if (rtsLen !== null && total !== null && rtsLen > total)
      throw new Error("math: more reaction times than problems");
  }

  if (game === "stroop") {
    const totalStimuli = num("totalStimuli");
    const wrongClicks = num("wrongClicks");
    if (
      totalStimuli !== null &&
      wrongClicks !== null &&
      wrongClicks > totalStimuli
    )
      throw new Error("stroop: wrong clicks exceed stimuli shown");
    if (totalStimuli !== null && rtsLen !== null && rtsLen > totalStimuli)
      throw new Error("stroop: more reaction times than stimuli");
  }

  if (game === "gonogo") {
    const trials = num("trials");
    const goTrials = num("goTrials");
    const nogoTrials = num("nogoTrials");
    const hits = num("hits");
    const fa = num("falseAlarms");
    if (
      trials !== null &&
      goTrials !== null &&
      nogoTrials !== null &&
      goTrials + nogoTrials !== trials
    )
      throw new Error("gonogo: go+nogo must equal trials");
    if (goTrials !== null && hits !== null && hits > goTrials)
      throw new Error("gonogo: hits exceed go trials");
    if (nogoTrials !== null && fa !== null && fa > nogoTrials)
      throw new Error("gonogo: false alarms exceed nogo trials");
    if (goTrials !== null && rtsLen !== null && rtsLen > goTrials)
      throw new Error("gonogo: more reaction times than go trials");
  }

  if (game === "mental") {
    const trials = num("trials");
    const correct = num("correct");
    const wrong = num("wrong");
    if (
      trials !== null &&
      correct !== null &&
      wrong !== null &&
      correct + wrong !== trials
    )
      throw new Error("mental: correct+wrong must equal trials");
    if (trials !== null && rtsLen !== null && rtsLen > trials)
      throw new Error("mental: more reaction times than trials");
  }

  if (game === "corsi") {
    const trials = num("trials");
    const correctTrials = num("correctTrials");
    const taps = num("taps");
    const span = num("span");
    const wrongClicks = num("wrongClicks");
    if (trials !== null && correctTrials !== null && correctTrials > trials)
      throw new Error("corsi: correct trials exceed trials");
    // Moi luot chi ket thuc bang dung mot cu cham sai.
    if (trials !== null && wrongClicks !== null && wrongClicks > trials)
      throw new Error("corsi: wrong clicks exceed trials");
    if (taps !== null && rtsLen !== null && rtsLen > taps)
      throw new Error("corsi: more reaction times than taps");
    // Chuoi dai nhat khong the vuot so o cua luoi 3x3.
    if (span !== null && span > 9)
      throw new Error("corsi: span exceeds grid size");
    if (span !== null && taps !== null && taps < span)
      throw new Error("corsi: fewer taps than the reported span");
  }

  if (game === "trail") {
    const nodes = num("nodes");
    const wrongClicks = num("wrongClicks");
    const mode = t.mode;
    if (mode !== undefined && mode !== "A" && mode !== "B")
      throw new Error("trail: mode must be A or B");
    if (nodes !== null && nodes < 2) throw new Error("trail: too few nodes");
    // Dong ho bat dau tu cu bam dung dau tien => dung nodes-1 buoc nhay.
    if (nodes !== null && rtsLen !== null && rtsLen > nodes)
      throw new Error("trail: more reaction times than nodes");
    if (nodes !== null && wrongClicks !== null && wrongClicks > nodes * 40)
      throw new Error("trail: implausible number of wrong clicks");
  }
}
