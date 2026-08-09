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
  type Telemetry,
} from "./core.ts";

export function scoreNBack(t: Telemetry): ScoredRound {
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

  // v54: noi san N-Back. Truoc day focus nhan BA he so nho lien tiep
  // (acc^1.15 * 0.5..0.9 * 0.65..0.95) nen nguoi choi yeu chi con 174 diem,
  // trong khi cung muc "yeu" o Reaction duoc 490 — lech 316 tren cung 1 truc.
  // Nang san hai he so phu, giu nguyen do nhay theo accuracy.
  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * Math.pow(accuracy, 1.2) * (0.62 + 0.36 * depth)),
    focus: clamp(
      MAX *
        Math.pow(accuracy, 1.15) *
        (0.62 + 0.32 * clamp01(1 - faRate)) *
        (0.72 + 0.26 * depth),
    ),
    // v54: target 550 -> 620, diff 0.8 -> 0.86. Voi target 550 thi nguoi choi
    // muc trung binh (RT ~700ms) chi duoc Speed 515, trong khi cung muc trung
    // binh o Trail duoc 883 — lech 368 diem tren cung truc Speed. N-Back doi
    // hoi giu chuoi trong dau nen RT tu nhien cham hon, target phai phan anh do.
    speed: rts.length >= 3 ? speed(rts, 620, 0.82) : null,
  };
  return { axes, headline: headline(axes), label: `${n}-Back`, timeMs };
}

// Go/No-Go: ức chế phản xạ. Focus là trục chính; Speed từ RT hit GO.
// Client chuẩn: 40 trial, ~30% NOGO. Cho 30–48 để tương thích tinh chỉnh sau.
const GONOGO_TRIALS_MIN = 30;
const GONOGO_TRIALS_MAX = 48;

export function scoreGoNoGo(t: Telemetry): ScoredRound {
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
  if (rts.length > hits) throw new Error("Go/No-Go more RTs than hits");

  const hitRate = hits / Math.max(1, goTrials);
  const faRate = falseAlarms / Math.max(1, nogoTrials);
  /**
   * v54 — VA HAI LO HONG.
   *
   * Cong thuc cu: accuracy = hitRate * 0.4 + (1 - faRate) * 0.6. Vi hai thanh
   * phan CONG voi nhau, chi can lam tot mot ben la co diem:
   *  1. BAM MOI O: hitRate = 1, faRate = 1 => accuracy = 0.4; Speed lai chi
   *     dua tren median RT hit va KHONG nhan accuracy, nen bam that nhanh
   *     (~330ms) cho Speed = 1000, Focus = 143 => headline 572, cao hon ca
   *     mot van Sudoku Medium hoan hao (567).
   *  2. KHONG BAM GI CA: hitRate = 0, faRate = 0 => accuracy = 0.6 =>
   *     Focus = 475, Speed = null => headline 475 ma khong he choi.
   * Anticheat chi gan soft flag, va soft flag KHONG ha diem truc.
   *
   * Cong thuc moi NHAN hai thanh phan: phai vua bat duoc GO vua nen duoc NOGO.
   * Bam moi o => (1 - faRate) = 0 => accuracy = 0. Khong bam gi => hitRate = 0
   * => accuracy = 0. Ca hai kieu gian lan ve 0 diem.
   * Speed cung duoc gan cong uc che nen bam bua khong the "an" toc do.
   */
  const accuracy = clamp01(hitRate) * clamp01(1 - faRate);
  const inhibition = Math.pow(clamp01(1 - faRate), 0.9);
  const statRts = statSamples(rts, 80);

  const axes = {
    ...NO_AXES,
    // Luy thua ha 1.25 -> 1.15 va san he so FA nang len, de bu cho viec
    // accuracy gio la phep NHAN (nghiem hon han cong thuc cong cu).
    focus: clamp(
      MAX *
        0.9 *
        Math.pow(accuracy, 1.15) *
        (0.62 + 0.38 * clamp01(1 - faRate * 1.35)),
    ),
    // Target 420ms — phản xạ có lựa chọn chậm hơn simple RT (~280).
    // Nhan `inhibition`: bam bua (faRate = 1) => Speed = 0.
    speed:
      statRts.length >= 3
        ? clamp(speed(statRts, 420, 0.88) * inhibition)
        : null,
  };
  return { axes, headline: headline(axes), label: "Go / No-Go", timeMs };
}

// Mental Rotation 2D: Spatial chính, Speed phụ. Client chuẩn 24 trial.
const MENTAL_TRIALS_MIN = 20;
const MENTAL_TRIALS_MAX = 32;

export function scoreMentalRotation(t: Telemetry): ScoredRound {
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
    const load = Math.min(1, Math.abs((a > 180 ? 360 - a : a) / 180));
    // Chỉ cộng load cho trial đúng — sai không "ăn" bonus khó.
    const ok = flags ? flags[i] === true : true;
    if (ok) {
      angleLoad += load;
      angleN += 1;
    }
  }
  const meanAngleLoad = angleN > 0 ? angleLoad / angleN : 0.5;
  // baseline 0.78 + up to 0.24 from hard angles answered correctly.
  // v54: nang san 0.72 -> 0.78. Mental Rotation co spatial la truc CHINH nhung
  // tran thuc te chi 817, thap hon ca Schulte (spatial chi la truc PHU, 897).
  const angleFactor = 0.78 + 0.24 * meanAngleLoad;

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

export function scoreCorsi(t: Telemetry): ScoredRound {
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
  if (rts.length !== taps) throw new Error("Corsi: rts length must equal taps");
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
  // v54 — san tham gia, giong Memory game. Nho lai dung mot chuoi 3 o van la
  // co tin hieu that; cong thuc cu cho spanNorm^0.8 = 0.238 nen chi 123 diem.
  // Tai spanNorm = 1 he so van bang 1 => TRAN KHONG DOI.
  const SPAN_FLOOR = 0.24;
  const spanFactor = (exp: number) =>
    span > 0 ? SPAN_FLOOR + (1 - SPAN_FLOOR) * Math.pow(spanNorm, exp) : 0;
  const accuracy = clamp01(correctTrials / Math.max(1, trials));
  const errorRate = clamp01(wrongClicks / Math.max(1, taps));

  const axes = {
    ...NO_AXES,
    // v54: luy thua 0.85 -> 0.65 va 0.8 -> 0.6, cong them san tham gia.
    memory: clamp(MAX * 0.95 * spanFactor(0.65) * (0.7 + 0.3 * accuracy)),
    // v54: 0.88 -> 0.84 de tran spatial cua Corsi (truc PHU) khong vuot
    // Mental Rotation (truc CHINH), la game co spatial LA truc chinh.
    spatial: clamp(MAX * 0.84 * spanFactor(0.6) * Math.pow(1 - errorRate, 1.2)),
  };
  return { axes, headline: headline(axes), label: `Span ${span}`, timeMs };
}

// Trail Making: Speed chinh, Focus phu. Moi buoc la mot lan quet thi giac +
// chuyen bo quy tac (so <-> chu), nen nhip giua cac buoc la tin hieu that.
const TRAIL_MIN_NODES = 12;
const TRAIL_MAX_NODES = 40;

export function scoreTrail(t: Telemetry): ScoredRound {
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
  // v54: mode B 0.95 -> 0.90. Trail B la game moi nhat va vo tinh duoc dat he
  // so cao nhat he thong, nen no chiem dinh CA hai truc Speed va Focus.
  const diff = mode === "B" ? 0.9 : 0.78;

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

export function scoreSearch(t: Telemetry): ScoredRound {
  const timeMs = finite(t?.totalTimeMs, "totalTimeMs", 30_000, 120_000);
  const score = int(t?.score, "score", 0, 200);
  const mistakes = int(t?.mistakes, "mistakes", 0, 500);
  const rts = numberArray(t?.rts, "rts", 0, 200);

  const accuracy = clamp01(score / Math.max(1, score + mistakes));
  const statRts = statSamples(rts, 120);

  const target = 1100;
  const diff = 0.85;

  const axes = {
    ...NO_AXES,
    speed: statRts.length >= 3 ? speed(statRts, target, diff) : null,
    focus: focus(statRts, accuracy, diff, target),
  };

  return {
    axes,
    headline: headline(axes),
    label: `${score} found`,
    timeMs,
  };
}

// ---- Rang buoc bien cho telemetry tho (chong gia mao tu DevTools) ----
// Khong the chung minh tuyet doi, nhung chan duoc cac gia tri phi ly.
// San THONG KE: mau nhanh hon nguong nay bi loai khoi median/CV (statSamples),
// nhung KHONG lam hong ca van — xem HARD_MIN_RT_MS.
