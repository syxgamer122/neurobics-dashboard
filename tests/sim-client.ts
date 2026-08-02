// Gia lap thu vien cham diem PHIA CLIENT: sanitizeRating, pullUpRating,
// decayRating, daysSince, calcBrainAge, percentileOf.
const M = await import(
  "../src/app/lib/scoring.ts"
);

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

console.log("===== sanitizeRating (fix vong 1: 1001 khong con xoa trang truc) =====");
t("sanitizeRating(999)", M.sanitizeRating(999), 999);
t("sanitizeRating(1000)", M.sanitizeRating(1000), 1000);
t("sanitizeRating(1001) -> kep ve 1000", M.sanitizeRating(1001), 1000);
t("sanitizeRating(1050) -> ranh gioi, kep", M.sanitizeRating(1050), 1000);
t("sanitizeRating(1051) -> legacy, doc 0", M.sanitizeRating(1051), 0);
t("sanitizeRating(4200) -> legacy tich luy", M.sanitizeRating(4200), 0);
t("sanitizeRating(-5)", M.sanitizeRating(-5), 0);
t("sanitizeRating(null)", M.sanitizeRating(null), 0);
t("sanitizeRating(NaN)", M.sanitizeRating(NaN), 0);

console.log("\n===== pullUpRating (chi keo len, khong keo xuong) =====");
t("van te hon: (500, 400)", M.pullUpRating(500, 400), 500);
t("hon it, snap: (500, 502)", M.pullUpRating(500, 502), 502);
t("hon nhieu: (500, 600) = 500+0.4*100", M.pullUpRating(500, 600), 540);
t("tu 0: (null, 300)", M.pullUpRating(null, 300), 300);
t("gan tran: (998, 1000)", M.pullUpRating(998, 1000), 1000);
t("legacy prev: (4200, 600)", M.pullUpRating(4200, 600), 600);
t("tang toi thieu 1: (900, 902)", M.pullUpRating(900, 902), 902);

console.log("\n===== decayRating (an han 7 ngay, san 35%) =====");
t("idle 0", M.decayRating(800, 0), 800);
t("idle 7 (con trong an han)", M.decayRating(800, 7), 800);
approx("idle 14 (1 tuan decay)", M.decayRating(800, 14), 800 * 0.98, 1);
approx("idle 35 (4 tuan)", M.decayRating(800, 35), 800 * Math.pow(0.98, 4), 1);
approx("idle 3650 (10 nam) cham san 35%", M.decayRating(800, 3650), 280, 1);
t("gia tri 0 thi khong am", M.decayRating(0, 999), 0);

console.log("\n===== daysSince (moc ngay theo lich VN, UTC+7) =====");
// 2026-08-02 07:00 gio VN = 2026-08-02T00:00:00Z
const now = new Date("2026-08-02T00:00:00.000Z");
t("hom nay", M.daysSince("2026-08-02", now), 0);
t("hom qua", M.daysSince("2026-08-01", now), 1);
t("60 ngay truoc", M.daysSince("2026-06-03", now), 60);
t("ngay tuong lai -> 0", M.daysSince("2026-09-01", now), 0);
t("null", M.daysSince(null, now), 0);
// Bay gio la 06:30 sang gio VN cua ngay 02 (= 23:30Z ngay 01)
const earlyVn = new Date("2026-08-01T23:30:00.000Z");
t(
  "6h30 sang VN ngay 02, last_active 02 -> 0 (khong am/lech mui gio)",
  M.daysSince("2026-08-02", earlyVn),
  0,
);

console.log("\n===== percentileOf =====");
const pop = { mean: 400, sd: 150, n: 120 };
approx("dung trung binh -> 0.5", M.percentileOf(400, pop), 0.5, 0.01);
approx("+1sd -> ~0.841", M.percentileOf(550, pop), 0.841, 0.01);
approx("-1sd -> ~0.159", M.percentileOf(250, pop), 0.159, 0.01);
t("sd = 0 khong lam vo", Number.isFinite(M.percentileOf(500, { mean: 400, sd: 0, n: 50 })), true);

console.log("\n===== calcBrainAge =====");
const NOW = new Date("2026-08-02T00:00:00.000Z");
t(
  "chua co nam sinh",
  M.calcBrainAge({ cognitiveIndex: 500, birthYear: null, roundsPlayed: 30 }, pop, NOW).status,
  "needs_age",
);
t(
  "chua du 5 van",
  M.calcBrainAge({ cognitiveIndex: 500, birthYear: 1990, roundsPlayed: 3 }, pop, NOW).status,
  "calibrating",
);
{
  const r: any = M.calcBrainAge(
    { cognitiveIndex: 400, birthYear: 1990, roundsPlayed: 30 },
    pop,
    NOW,
  );
  t("trung binh dan so -> delta 0", r.delta, 0);
  t("tuoi that 36", r.realAge, 36);
}
{
  const r: any = M.calcBrainAge(
    { cognitiveIndex: 900, birthYear: 1990, roundsPlayed: 30 },
    pop,
    NOW,
  );
  const ok = r.delta > 5 && r.delta <= M.MAX_AGE_SWING;
  if (ok) { pass++; console.log(`PASS  choi rat tot -> tre hon ${r.delta} tuoi (age=${r.age})`); }
  else { fails.push("brain age cao"); console.log(`FAIL  choi tot nhung delta=${r.delta}`); }
}
{
  const r: any = M.calcBrainAge(
    { cognitiveIndex: 50, birthYear: 1990, roundsPlayed: 30 },
    pop,
    NOW,
  );
  const ok = r.delta < -5 && r.delta >= -M.MAX_AGE_SWING;
  if (ok) { pass++; console.log(`PASS  choi kem -> gia hon ${-r.delta} tuoi (age=${r.age})`); }
  else { fails.push("brain age thap"); console.log(`FAIL  choi kem nhung delta=${r.delta}`); }
}
{
  const r: any = M.calcBrainAge(
    { cognitiveIndex: 900, birthYear: 2020, roundsPlayed: 30 },
    pop,
    NOW,
  );
  const ok = r.age >= 5;
  if (ok) { pass++; console.log(`PASS  tre 6 tuoi choi sieu tot -> age=${r.age} (khong duoi 5)`); }
  else { fails.push("brain age san 5"); console.log(`FAIL  age=${r.age}`); }
}
{
  const thin: any = M.calcBrainAge(
    { cognitiveIndex: 500, birthYear: 1990, roundsPlayed: 30 },
    { mean: 400, sd: 150, n: 3 },
    NOW,
  );
  t("dan so mong -> provisional", thin.provisional, true);
}

console.log("\n==================================================");
console.log(`TONG: ${pass}/${pass + fails.length} dat`);
if (fails.length) for (const f of fails) console.log("  - " + f);
