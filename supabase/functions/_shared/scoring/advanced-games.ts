// N-Back, Go/No-Go, Mental Rotation, Corsi Block and Trail Making.
import {
  MAX,
  NO_AXES,
  clamp,
  clamp01,
  finite,
  focus,
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

// Corsi Block: Memory chinh, Spatial phu. Khong cham Speed/Focus vi pha chieu
// chuoi co thoi luong co dinh — dong ho khong phai nhip cua nguoi choi.
const CORSI_MAX_SPAN = 9;

export function scoreCorsi(t: any): ScoredRound {
  // Thua ngay chuoi dau (2 o) chi mat ~1s, nen san duoi phai thap.
  const timeMs = finite(t?.timeMs, "timeMs", 800, 7_200_000);
  const span = int(t?.span, "span", 0, CORSI_MAX_SPAN);
  const trials = int(t?.trials, "trials", 1, 40);
  const correctTrials = int(t?.correctTrials, "correctTrials", 0, 40);
  const taps = int(t?.taps, "taps", 0, 400);
  const wrongClicks = int(t?.wrongClicks, "wrongClicks", 0, 80);
  const rts = numberArray(t?.rts, "rts", 0, 400);

  if (correctTrials > trials)
    throw new Error("Corsi: correct trials exceed trials");
  if (rts.length !== taps)
    throw new Error("Corsi: rts length must equal taps");
  // Moi luot chi ket thuc bang MOT cu cham sai, nen khong the sai hon so luot.
  if (wrongClicks > trials)
    throw new Error("Corsi: wrong clicks exceed trials");
  // Chuoi ngan nhat dai 2 o, nen mot luot dung phai ton it nhat 2 lan cham.
  if (taps < 2 * correctTrials)
    throw new Error("Corsi: fewer taps than correct sequences require");
  if (span > 0 && correctTrials === 0)
    throw new Error("Corsi: span reported without any correct sequence");

  // span 2 -> 0, span 5 (trung binh nguoi lon) -> 0.5, span 8 -> 1.
  const spanNorm = clamp01((span - 2) / 6);
  const accuracy = clamp01(correctTrials / Math.max(1, trials));
  const errorRate = clamp01(wrongClicks / Math.max(1, taps));

  const axes = {
    ...NO_AXES,
    memory: clamp(
      MAX * 0.95 * Math.pow(spanNorm, 0.85) * (0.7 + 0.3 * accuracy),
    ),
    spatial: clamp(
      MAX * 0.88 * Math.pow(spanNorm, 0.8) * Math.pow(1 - errorRate, 1.2),
    ),
  };
  return { axes, headline: headline(axes), label: `Span ${span}`, timeMs };
}

// Trail Making: Speed chinh, Focus phu. Moi buoc la mot lan quet thi giac +
// chuyen bo quy tac (so <-> chu), nen nhip giua cac buoc la tin hieu that.
const TRAIL_MIN_NODES = 12;
const TRAIL_MAX_NODES = 40;

export function scoreTrail(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 3_000, 900_000);
  const nodes = int(t?.nodes, "nodes", TRAIL_MIN_NODES, TRAIL_MAX_NODES);
  const wrongClicks = int(t?.wrongClicks, "wrongClicks", 0, 500);
  const rts = numberArray(t?.rts, "rts", 0, TRAIL_MAX_NODES);
  const mode = t?.mode === "A" ? "A" : "B";

  // Dong ho bat dau tu cu bam DUNG dau tien => dung nodes-1 buoc nhay.
  const hops = nodes - 1;
  if (rts.length !== hops)
    throw new Error("Trail Making: rts length must equal node hops");

  const accuracy = clamp01(1 - wrongClicks / Math.max(1, hops));
  const statRts = statSamples(rts, 120);

  // Mode B cham hon mode A mot cach he thong vi phai doi chieu hai chuoi.
  const target = mode === "B" ? 1100 : 760;
  const diff = mode === "B" ? 0.95 : 0.78;

  const axes = {
    ...NO_AXES,
    speed: statRts.length >= 4 ? speed(statRts, target, diff) : null,
    focus: focus(statRts, accuracy, diff, target),
  };
  return {
    axes,
    headline: headline(axes),
    label: mode === "B" ? "Trail B" : "Trail A",
    timeMs,
  };
}

// ---- Rang buoc bien cho telemetry tho (chong gia mao tu DevTools) ----
// Khong the chung minh tuyet doi, nhung chan duoc cac gia tri phi ly.
// San THONG KE: mau nhanh hon nguong nay bi loai khoi median/CV (statSamples),
// nhung KHONG lam hong ca van — xem HARD_MIN_RT_MS.
