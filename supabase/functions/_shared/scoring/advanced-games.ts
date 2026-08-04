// N-Back, Go/No-Go and Mental Rotation.
import {
  MAX,
  NO_AXES,
  clamp,
  clamp01,
  finite,
  headline,
  int,
  numberArray,
  speed,
  statSamples,
  type ScoredRound,
} from "./core.ts";

export function scoreNBack(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 3_000, 7_200_000);
  const n = int(t?.n, "n", 1, 9);
  const trials = int(t?.trials, "trials", 5, 200);
  const hits = int(t?.hits, "hits", 0, 200);
  const misses = int(t?.misses, "misses", 0, 200);
  const falseAlarms = int(t?.falseAlarms, "falseAlarms", 0, 200);
  const rts = statSamples(numberArray(t?.rts, "rts", 0, 200), 80);

  if (hits + misses > trials || falseAlarms > trials)
    throw new Error("N-Back telemetry is inconsistent");

  const targets = hits + misses;
  // d-prime rut gon: ti le bat dung tru ti le bao dong nham.
  const hitRate = targets > 0 ? hits / targets : 0;
  // FA phat nang hon (0.95): bam nham nhieu ha diem ro.
  const faRate = clamp01(falseAlarms / Math.max(1, trials - targets));
  const accuracy = clamp01(hitRate - faRate * 0.95);
  // n=2 ~0.33, n=3 ~0.5, n=4 ~0.67, n=5 ~0.83, n=6 = day. Truoc /5 de full o n=5.
  const depth = clamp01(n / 6);

  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * Math.pow(accuracy, 1.2) * (0.55 + 0.4 * depth)),
    focus: clamp(
      MAX *
        Math.pow(accuracy, 1.15) *
        (0.5 + 0.4 * clamp01(1 - faRate)) *
        (0.65 + 0.3 * depth),
    ),
    // Target 550ms (truoc 700), diff 0.8: RT thuong ~700-800 khong full.
    speed: rts.length >= 3 ? speed(rts, 550, 0.8) : null,
  };
  return { axes, headline: headline(axes), label: `${n}-Back`, timeMs };
}

// Go/No-Go: ức chế phản xạ. Focus là trục chính; Speed từ RT hit GO.
// Client chuẩn: 40 trial, ~30% NOGO. Cho 30–48 để tương thích tinh chỉnh sau.
const GONOGO_TRIALS_MIN = 30;
const GONOGO_TRIALS_MAX = 48;

export function scoreGoNoGo(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 8_000, 600_000);
  const trials = int(t?.trials, "trials", GONOGO_TRIALS_MIN, GONOGO_TRIALS_MAX);
  const goTrials = int(t?.goTrials, "goTrials", 1, GONOGO_TRIALS_MAX);
  const nogoTrials = int(t?.nogoTrials, "nogoTrials", 1, GONOGO_TRIALS_MAX);
  const hits = int(t?.hits, "hits", 0, GONOGO_TRIALS_MAX);
  const misses = int(t?.misses, "misses", 0, GONOGO_TRIALS_MAX);
  const falseAlarms = int(t?.falseAlarms, "falseAlarms", 0, GONOGO_TRIALS_MAX);
  const correctRejections = int(
    t?.correctRejections,
    "correctRejections",
    0,
    GONOGO_TRIALS_MAX,
  );
  const rts = numberArray(t?.rts, "rts", 0, GONOGO_TRIALS_MAX);

  if (goTrials + nogoTrials !== trials)
    throw new Error("Go/No-Go trial counts inconsistent");
  if (hits + misses !== goTrials)
    throw new Error("Go/No-Go GO outcomes inconsistent");
  if (falseAlarms + correctRejections !== nogoTrials)
    throw new Error("Go/No-Go NOGO outcomes inconsistent");
  if (rts.length > hits)
    throw new Error("Go/No-Go more RTs than hits");

  const hitRate = hits / Math.max(1, goTrials);
  const faRate = falseAlarms / Math.max(1, nogoTrials);
  // Ức chế nặng hơn tốc độ bắt GO: false alarm ăn sâu vào accuracy.
  const accuracy = clamp01(hitRate * 0.4 + (1 - faRate) * 0.6);
  const statRts = statSamples(rts, 80);

  const axes = {
    ...NO_AXES,
    // diff 0.9: elite + gần 0 FA mới gần full Focus.
    focus: clamp(
      MAX *
        0.9 *
        Math.pow(accuracy, 1.25) *
        (0.5 + 0.5 * clamp01(1 - faRate * 1.35)),
    ),
    // Target 420ms — phản xạ có lựa chọn chậm hơn simple RT (~280).
    speed: statRts.length >= 3 ? speed(statRts, 420, 0.88) : null,
  };
  return { axes, headline: headline(axes), label: "Go / No-Go", timeMs };
}

// Mental Rotation 2D: Spatial chính, Speed phụ. Client chuẩn 24 trial.
const MENTAL_TRIALS_MIN = 20;
const MENTAL_TRIALS_MAX = 32;

export function scoreMentalRotation(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 8_000, 600_000);
  const trials = int(t?.trials, "trials", MENTAL_TRIALS_MIN, MENTAL_TRIALS_MAX);
  const correct = int(t?.correct, "correct", 0, MENTAL_TRIALS_MAX);
  const wrong = int(t?.wrong, "wrong", 0, MENTAL_TRIALS_MAX);
  const rts = numberArray(t?.rts, "rts", 0, MENTAL_TRIALS_MAX);
  const angles = numberArray(t?.angles, "angles", 0, MENTAL_TRIALS_MAX);

  if (correct + wrong !== trials)
    throw new Error("Mental Rotation: correct+wrong must equal trials");
  if (rts.length !== trials)
    throw new Error("Mental Rotation: rts length must equal trials");
  if (angles.length !== trials)
    throw new Error("Mental Rotation: angles length must equal trials");

  // mirrors / correctFlags: optional consistency checks
  const mirrors = Array.isArray(t?.mirrors) ? t.mirrors : null;
  const flags = Array.isArray(t?.correctFlags) ? t.correctFlags : null;
  if (mirrors && mirrors.length !== trials)
    throw new Error("Mental Rotation: mirrors length must equal trials");
  if (flags && flags.length !== trials)
    throw new Error("Mental Rotation: correctFlags length must equal trials");
  if (flags) {
    let flagCorrect = 0;
    for (const f of flags) if (f === true) flagCorrect += 1;
    if (flagCorrect !== correct)
      throw new Error("Mental Rotation: correctFlags disagree with correct");
  }

  const accuracy = clamp01(correct / Math.max(1, trials));

  // Độ khó góc: 0° dễ, 180° khó hơn. Trung bình |sin(θ/2)| ~ độ lệch định hướng.
  let angleLoad = 0;
  let angleN = 0;
  for (let i = 0; i < angles.length; i++) {
    const a = Math.abs(Number(angles[i]) % 360);
    if (!Number.isFinite(a)) continue;
    // 0→0, 180→1
    const load = Math.min(1, Math.abs(((a > 180 ? 360 - a : a) / 180)));
    // Chỉ cộng load cho trial đúng — sai không "ăn" bonus khó.
    const ok = flags ? flags[i] === true : true;
    if (ok) {
      angleLoad += load;
      angleN += 1;
    }
  }
  const meanAngleLoad = angleN > 0 ? angleLoad / angleN : 0.5;
  // baseline 0.72 + up to 0.28 from hard angles answered correctly
  const angleFactor = 0.72 + 0.28 * meanAngleLoad;

  const statRts = statSamples(rts, 120);

  const axes = {
    ...NO_AXES,
    // Spatial thuần: accuracy^1.15 * angle factor, cap soft 0.95
    spatial: clamp(MAX * 0.95 * Math.pow(accuracy, 1.15) * angleFactor),
    // Choice RT cho so khớp hình — target ~1400ms (chậm hơn simple RT nhiều).
    speed: statRts.length >= 4 ? speed(statRts, 1400, 0.72) : null,
  };
  return {
    axes,
    headline: headline(axes),
    label: "Mental Rotation",
    timeMs,
  };
}

// ---- Rang buoc bien cho telemetry tho (chong gia mao tu DevTools) ----
// Khong the chung minh tuyet doi, nhung chan duoc cac gia tri phi ly.
// San THONG KE: mau nhanh hon nguong nay bi loai khoi median/CV (statSamples),
// nhung KHONG lam hong ca van — xem HARD_MIN_RT_MS.
