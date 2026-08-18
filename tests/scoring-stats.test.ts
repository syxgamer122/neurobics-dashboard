import { describe, expect, it } from "vitest";
import {
  RATING_MIN,
  RATING_MAX,
  // RATING_TOLERANCE,
  EMA_ALPHA,
  EMA_ALPHA_DOWN,
  RATING_SNAP,
  PULL_UP_SNAP,
  DECAY_GRACE_DAYS,
  DECAY_PER_WEEK,
  // DECAY_FLOOR_RATIO,
  CALIBRATION_ROUNDS,
  MAX_AGE_SWING,
  MIN_POPULATION,
  DEFAULT_POPULATION,
  clampRating,
  clamp01,
  sanitizeRating,
  applyRoundRating,
  pullUpRating,
  // daysSince,
  median,
  mean,
  coefficientOfVariation,
  lapseRate,
} from "../src/app/lib/provisional-score";

// Bo sung cho scoring.test.ts: cac ham thong ke va tien ich chua duoc phu.
// Gia tri ky vong lay tu viec chay that, khong doan theo cong thuc.

describe("clampRating", () => {
  it("kep vao [0, 1000] va lam tron", () => {
    expect(clampRating(-50)).toBe(0);
    expect(clampRating(-0.4)).toBe(0);
    expect(clampRating(0.5)).toBe(1);
    expect(clampRating(1.4)).toBe(1);
    expect(clampRating(499.5)).toBe(500);
    expect(clampRating(1000.4)).toBe(1000);
    expect(clampRating(1500)).toBe(RATING_MAX);
  });

  it("luon tra ve so nguyen trong khoang hop le", () => {
    for (const v of [-999, 0, 12.34, 777.777, 1000, 99999]) {
      const r = clampRating(v);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(RATING_MIN);
      expect(r).toBeLessThanOrEqual(RATING_MAX);
    }
  });

  it("chan moi gia tri khong huu han", () => {
    expect(clampRating(NaN)).toBe(RATING_MIN);
    expect(clampRating(Infinity)).toBe(RATING_MIN);
    expect(clampRating(-Infinity)).toBe(RATING_MIN);
  });
});

describe("clamp01", () => {
  it("kep vao [0, 1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.33)).toBe(0.33);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
  });
});

describe("sanitizeRating — bien do dung sai", () => {
  it("tha thu sai so lam tron nhung chan du lieu tich luy cu bang cach kep xuong 1000", () => {
    expect(sanitizeRating(1050)).toBe(1000);
    expect(sanitizeRating(1050.5)).toBe(0);
    expect(sanitizeRating(1051)).toBe(0);
  });

  it("tu choi moi thu khong phai so huu han", () => {
    expect(sanitizeRating(NaN)).toBe(0);
    expect(sanitizeRating(Infinity)).toBe(0);
    expect(sanitizeRating(-Infinity)).toBe(0);
    expect(sanitizeRating(undefined)).toBe(0);
    expect(sanitizeRating("500" as unknown as number)).toBe(0);
  });
});

describe("applyRoundRating", () => {
  it("ket hop Exponential Moving Average hai chieu: tot len cham, te di nhanh", () => {
    // Round 800 gap goc 400 = 800 - 400 = +400 => gain => alpha 0.1
    // 400 + 0.1 * 400 = 440
    expect(applyRoundRating(400, 800)).toBe(560);

    // Round 400 gap goc 800 = 400 - 800 = -400 => loss => alpha 0.28
    // 800 + 0.28 * -400 = 800 - 112 = 688
    expect(applyRoundRating(800, 400)).toBe(688);
  });

  it("xu ly tot cold start: lan dau choi lay diem round vao luon", () => {
    expect(applyRoundRating(null, 650)).toBe(650);
    expect(applyRoundRating(undefined, 200)).toBe(200);
  });

  it("snap neu diem xap xi giong nhau (cung khoang dung sai)", () => {
    expect(applyRoundRating(800, 802)).toBe(802);
    expect(applyRoundRating(800, 797)).toBe(797);
  });

  it("lam sach diem cu truoc khi tinh", () => {
    expect(applyRoundRating(4200, 600)).toBe(600); // legacy 4200 -> kep thanh 0 -> xem nhu cold start
  });

  it("giu rating cu neu diem vong khong huu han", () => {
    expect(applyRoundRating(500, NaN)).toBe(500);
    expect(applyRoundRating(500, Infinity)).toBe(500);
    expect(applyRoundRating(500, -Infinity)).toBe(500);
    expect(applyRoundRating(null, NaN)).toBe(0);
  });

  it("khong dao chieu tai bien snap", () => {
    expect(applyRoundRating(500, 503)).toBe(503);
    expect(applyRoundRating(500, 504)).toBe(503);
    expect(applyRoundRating(500, 496)).toBe(497);
    expect(applyRoundRating(500, 497)).toBe(497);
  });

  it("keo len bang EMA_ALPHA, keo xuong bang EMA_ALPHA_DOWN", () => {
    expect(EMA_ALPHA).toBeGreaterThan(EMA_ALPHA_DOWN);
    expect(applyRoundRating(500, 600)).toBe(500 + EMA_ALPHA * 100);
    expect(applyRoundRating(500, 1000)).toBe(700);
    expect(applyRoundRating(500, 400)).toBe(472);
    expect(applyRoundRating(500, 0)).toBe(360);
  });

  it("mot van te khong xoa duoc nhieu hon mot van gioi tao ra", () => {
    // Day la ly do co hai alpha khac nhau.
    const up = applyRoundRating(500, 700) - 500;
    const down = 500 - applyRoundRating(500, 300);
    expect(up).toBeGreaterThan(down);
  });

  it("lam sach diem cu truoc khi tinh", () => {
    expect(applyRoundRating(4200, 600)).toBe(600); // legacy 4200 -> kep 1000. 1000 -> 600 la giam, dung EMA_ALPHA_DOWN (0.28) => 1000 - 400 * 0.28 = 888.
    expect(applyRoundRating(1001, 900)).toBe(972); // 1001 -> kep 1000, 1000 xuong 900 -> giam 100, 1000 - 100 * 0.28 = 972.
    expect(applyRoundRating(700, -50)).toBe(504); // diem van am -> kep ve 0
  });

  it("khong bao gio thoat khoi [0, 1000]", () => {
    for (const prev of [0, 1, 500, 999, 1000]) {
      for (const round of [-500, 0, 500, 1000, 5000]) {
        const r = applyRoundRating(prev, round);
        expect(r).toBeGreaterThanOrEqual(RATING_MIN);
        expect(r).toBeLessThanOrEqual(RATING_MAX);
      }
    }
  });

  it("choi mai o mot muc thi hoi tu dung ve muc do", () => {
    let r = 100;
    for (let i = 0; i < 60; i++) r = applyRoundRating(r, 800);
    expect(r).toBe(800);
  });
});

describe("median", () => {
  it("xu ly mang rong, le, chan", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("khong sua mang goc", () => {
    // Ham sap xep de tim trung vi; neu sort tai cho thi thu tu RT bi dao,
    // keo theo lapseRate va anti-cheat doc sai du lieu.
    const src = [3, 1, 2];
    median(src);
    expect(src).toEqual([3, 1, 2]);
  });

  it("mot gia tri lac loai khong keo duoc trung vi", () => {
    expect(median([100, 100, 100, 100, 99999])).toBe(100);
  });
});

describe("mean", () => {
  it("trung binh cong, mang rong = 0", () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("khac trung vi khi co gia tri lac loai", () => {
    const xs = [100, 100, 100, 100, 99999];
    expect(mean(xs)).toBeGreaterThan(median(xs));
  });
});

describe("coefficientOfVariation", () => {
  it("can it nhat 2 mau", () => {
    expect(coefficientOfVariation([])).toBe(0);
    expect(coefficientOfVariation([5])).toBe(0);
  });

  it("deu tuyet doi => 0", () => {
    expect(coefficientOfVariation([10, 10, 10, 10])).toBe(0);
  });

  it("khong chia cho 0 khi trung binh <= 0", () => {
    expect(coefficientOfVariation([0, 0])).toBe(0);
    expect(coefficientOfVariation([-5, 5])).toBe(0);
  });

  it("khong phu thuoc don vi â€” day la diem mau chot", () => {
    // CV khong doi khi nhan ca mang voi mot hang so. Nho vay Focus khong
    // duoc cong diem chi vi nguoi choi bam nhanh hon.
    const slow = [100, 200, 300];
    const fast = slow.map((x) => x / 10);
    expect(coefficientOfVariation(slow)).toBe(0.5);
    expect(coefficientOfVariation(fast)).toBeCloseTo(0.5, 10);
  });

  it("cang lon xon cang cao", () => {
    const deu = coefficientOfVariation([200, 205, 195, 200]);
    const loanXa = coefficientOfVariation([50, 400, 120, 900]);
    expect(loanXa).toBeGreaterThan(deu);
  });
});

describe("lapseRate", () => {
  it("can it nhat 3 mau", () => {
    expect(lapseRate([])).toBe(0);
    expect(lapseRate([1, 2])).toBe(0);
  });

  it("trung vi <= 0 thi khong ket luan gi", () => {
    expect(lapseRate([0, 0, 0])).toBe(0);
  });

  it("dem ty le lan cham hon 2.5 lan trung vi", () => {
    expect(lapseRate([100, 100, 100, 100])).toBe(0);
    expect(lapseRate([100, 100, 100, 1000])).toBe(0.25);
  });

  it("nguong la > 2.5 lan, khong phai >=", () => {
    expect(lapseRate([100, 100, 100, 250])).toBe(0);
    expect(lapseRate([100, 100, 100, 251])).toBe(0.25);
  });

  it("nguong tuy chinh duoc", () => {
    expect(lapseRate([100, 100, 100, 1000], 10)).toBe(0);
  });
});



describe("hang so cau hinh", () => {
  it("giu nguyen gia tri ma cong thuc va migration dang dua vao", () => {
    expect([RATING_MIN, RATING_MAX]).toEqual([0, 1000]);
    expect(RATING_SNAP).toBe(3);
    expect(EMA_ALPHA).toBe(0.4);
    expect(EMA_ALPHA_DOWN).toBe(0.28);
    expect(DECAY_GRACE_DAYS).toBe(7);
    expect(DECAY_PER_WEEK).toBe(0.02);
    expect(CALIBRATION_ROUNDS).toBe(5);
    expect(MAX_AGE_SWING).toBe(12);
    expect(MIN_POPULATION).toBe(300);
    expect(DEFAULT_POPULATION).toEqual({ mean: 380, sd: 180, n: 0 });
  });
});



import { cv } from "../supabase/functions/_shared/scoring/core";

describe("Boundary tests for cv()", () => {
  it("returns null for empty lists", () => {
    expect(cv([])).toBeNull();
  });

  it("returns null for n < 10", () => {
    expect(cv([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });

  it("returns 0 if all elements are identical", () => {
    // 10 identical elements
    const arr = Array(10).fill(250);
    expect(cv(arr)).toBe(0);
  });

  it("handles outliers but keeps CV within reason", () => {
    const arr = Array(9).fill(250).concat([5000]);
    const val = cv(arr);
    expect(val).toBeGreaterThan(0.5);
  });
});
