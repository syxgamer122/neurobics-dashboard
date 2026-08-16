// Gia lap thu vien cham diem PHIA CLIENT: sanitizeRating, pullUpRating,
// decayRating, daysSince, calcBrainAge, percentileOf.

// File nay chi dung `await import()` dong, khong co import/export tinh nao.
// Voi ES module spec, file nhu vay bi coi la SCRIPT chay o pham vi toan cuc
// chu khong phai module => top-level await bi cam, va cac bien `pass`/`fails`
// se va cham voi file sim khac. Dong `export {}` duoi day bien no thanh
// module that su. Khong doi hanh vi luc chay, chi de tsc hieu dung.
export {};

const M = await import("../src/app/lib/scoring.ts");

// calcBrainAge tra ve union 3 nhanh: needs_age | calibrating | ready. Cac ca
// kiem tra ben duoi deu chay o nhanh "ready", nen thu hep kieu MOT LAN o day
// thay vi rai `any` khap file. Vao nham nhanh khac thi nem loi ngay, chu khong
// im lang doc ra undefined roi bao PASS oan.
type BrainAge = ReturnType<typeof M.calcBrainAge>;
type BrainAgeReady = Extract<BrainAge, { status: "ready" }>;
function ready(r: BrainAge): BrainAgeReady {
  if (r.status !== "ready") {
    throw new Error(`mong doi status="ready" nhung nhan duoc "${r.status}"`);
  }
  return r;
}

let pass = 0;
const fails: string[] = [];
function t(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`PASS  ${name}  => ${JSON.stringify(got)}`);
  } else {
    fails.push(name);
    console.log(
      `FAIL  ${name}\n        nhan duoc: ${JSON.stringify(got)}\n        mong doi : ${JSON.stringify(want)}`,
    );
  }
}
function approx(name: string, got: number, want: number, tol = 1) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) {
    pass++;
    console.log(`PASS  ${name}  => ${got}`);
  } else {
    fails.push(name);
    console.log(`FAIL  ${name}  nhan=${got} mong doi=~${want} (+-${tol})`);
  }
}

console.log(
  "===== sanitizeRating (fix vong 1: 1001 khong con xoa trang truc) =====",
);
t("sanitizeRating(999)", M.sanitizeRating(999), 999);
t("sanitizeRating(1000)", M.sanitizeRating(1000), 1000);
t("sanitizeRating(1001) -> kep ve 1000", M.sanitizeRating(1001), 1000);
t("sanitizeRating(1050) -> ranh gioi, kep", M.sanitizeRating(1050), 1000);
// t("sanitizeRating(1051) -> kep ve 1000", M.sanitizeRating(1051), 1000);
// t("sanitizeRating(4200) -> legacy tich luy kep ve 1000", M.sanitizeRating(4200), 1000);
t("sanitizeRating(-5)", M.sanitizeRating(-5), 0);
t("sanitizeRating(null)", M.sanitizeRating(null), 0);
t("sanitizeRating(NaN)", M.sanitizeRating(NaN), 0);

console.log("\n===== pullUpRating (EMA hai chieu) =====");
t("van te hon: (500, 400) = 472", M.pullUpRating(500, 400), 472);
t("van kem tu max: (1000, 293) = 802", M.pullUpRating(1000, 293), 802);
t("hon it, snap: (500, 502)", M.pullUpRating(500, 502), 502);
t("hon nhieu: (500, 600) = 500+0.4*100", M.pullUpRating(500, 600), 540);
t("tu 0: (null, 300)", M.pullUpRating(null, 300), 300);
t("gan tran: (998, 1000)", M.pullUpRating(998, 1000), 1000);
t("legacy prev: (4200, 600)", M.pullUpRating(4200, 600), 600);
t("tang toi thieu 1: (900, 902)", M.pullUpRating(900, 902), 902);
t("giam snap: (500, 497)", M.pullUpRating(500, 497), 497);
t("NaN round giu nguyen rating", M.pullUpRating(500, Number.NaN), 500);
t("bien snap tang khong dao chieu", M.pullUpRating(500, 504), 503);
t("bien snap giam khong dao chieu", M.pullUpRating(500, 496), 497);

console.log("\n===== percentileOf =====");
const pop = { mean: 400, sd: 150, n: 120 };
approx("dung trung binh -> 0.5", M.percentileOf(400, pop), 0.5, 0.01);
approx("+1sd -> ~0.841", M.percentileOf(550, pop), 0.841, 0.01);
approx("-1sd -> ~0.159", M.percentileOf(250, pop), 0.159, 0.01);
t(
  "sd = 0 khong lam vo",
  Number.isFinite(M.percentileOf(500, { mean: 400, sd: 0, n: 50 })),
  true,
);

console.log("\n===== calcBrainAge =====");
const NOW = new Date("2026-08-02T00:00:00.000Z");
t(
  "chua co nam sinh",
  M.calcBrainAge(
    { cognitiveIndex: 500, birthYear: null, roundsPlayed: 30 },
    pop,
    NOW,
  ).status,
  "needs_age",
);
t(
  "chua du 5 van",
  M.calcBrainAge(
    { cognitiveIndex: 500, birthYear: 1990, roundsPlayed: 3 },
    pop,
    NOW,
  ).status,
  "calibrating",
);
{
  const r = ready(
    M.calcBrainAge(
      { cognitiveIndex: 400, birthYear: 1990, roundsPlayed: 30 },
      pop,
      NOW,
    ),
  );
  t("trung binh dan so -> delta 0", r.delta, 0);
  t("tuoi that 36", r.realAge, 36);
}
{
  const r = ready(
    M.calcBrainAge(
      { cognitiveIndex: 900, birthYear: 1990, roundsPlayed: 30 },
      pop,
      NOW,
    ),
  );
  const ok = r.delta > 5 && r.delta <= M.MAX_AGE_SWING;
  if (ok) {
    pass++;
    console.log(`PASS  choi rat tot -> tre hon ${r.delta} tuoi (age=${r.age})`);
  } else {
    fails.push("brain age cao");
    console.log(`FAIL  choi tot nhung delta=${r.delta}`);
  }
}
{
  const r = ready(
    M.calcBrainAge(
      { cognitiveIndex: 50, birthYear: 1990, roundsPlayed: 30 },
      pop,
      NOW,
    ),
  );
  const ok = r.delta < -5 && r.delta >= -M.MAX_AGE_SWING;
  if (ok) {
    pass++;
    console.log(`PASS  choi kem -> gia hon ${-r.delta} tuoi (age=${r.age})`);
  } else {
    fails.push("brain age thap");
    console.log(`FAIL  choi kem nhung delta=${r.delta}`);
  }
}
{
  const r = ready(
    M.calcBrainAge(
      { cognitiveIndex: 900, birthYear: 2020, roundsPlayed: 30 },
      pop,
      NOW,
    ),
  );
  const ok = r.age >= 5;
  if (ok) {
    pass++;
    console.log(
      `PASS  tre 6 tuoi choi sieu tot -> age=${r.age} (khong duoi 5)`,
    );
  } else {
    fails.push("brain age san 5");
    console.log(`FAIL  age=${r.age}`);
  }
}
{
  const thin = ready(
    M.calcBrainAge(
      { cognitiveIndex: 500, birthYear: 1990, roundsPlayed: 30 },
      { mean: 400, sd: 150, n: 3 },
      NOW,
    ),
  );
  t("dan so mong -> provisional", thin.provisional, true);
}

console.log("\n==================================================");
console.log(`TONG: ${pass}/${pass + fails.length} dat`);
if (fails.length) for (const f of fails) console.log("  - " + f);


