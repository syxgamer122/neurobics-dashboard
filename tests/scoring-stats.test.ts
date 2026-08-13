import { describe, expect, it } from "vitest";
import {
  RATING_MIN,
  RATING_MAX,
  RATING_TOLERANCE,
  EMA_ALPHA,
  EMA_ALPHA_DOWN,
  RATING_SNAP,
  PULL_UP_SNAP,
  DECAY_GRACE_DAYS,
  DECAY_PER_WEEK,
  DECAY_FLOOR_RATIO,
  CALIBRATION_ROUNDS,
  MAX_AGE_SWING,
  MIN_POPULATION,
  DEFAULT_POPULATION,
  clampRating,
  clamp01,
  sanitizeRating,
  applyRoundRating,
  pullUpRating,
  decayRating,
  daysSince,
  median,
  mean,
  coefficientOfVariation,
  lapseRate,
} from "../src/app/lib/scoring";

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
  it("tha thu sai so lam tron nhung chan du lieu tich luy cu", () => {
    // Tran mem = 1000 * 1.05 = 1050. Den 1050 van coi la loi lam tron.
    expect(RATING_MAX * RATING_TOLERANCE).toBe(1050);
    expect(sanitizeRating(1050)).toBe(1000);
    expect(sanitizeRating(1050.5)).toBe(0);
    expect(sanitizeRating(1051)).toBe(0);
  });

  it("tu choi moi thu khong phai so huu han", () => {
    expect(sanitizeRating(Infinity)).toBe(0);
    expect(sanitizeRating(-Infinity)).toBe(0);
    expect(sanitizeRating(undefined)).toBe(0);
    // Chuoi so cung bi tu choi — tranh "500" + 1 = "5001".
    expect(sanitizeRating("500" as unknown as number)).toBe(0);
  });
});

describe("applyRoundRating", () => {
  it("la cung mot ham voi pullUpRating", () => {
    expect(PULL_UP_SNAP).toBe(RATING_SNAP);
    for (const [a, b] of [
      [500, 600],
      [500, 400],
      [null, 300],
    ] as Array<[number | null, number]>) {
      expect(pullUpRating(a, b)).toBe(applyRoundRating(a, b));
    }
  });

  it("van dau tien tro thanh moc chuan", () => {
    expect(applyRoundRating(null, 700)).toBe(700);
    expect(applyRoundRating(undefined, 450)).toBe(450);
    expect(applyRoundRating(0, 700)).toBe(700);
  });

  it("nhay thang khi khoang cach <= RATING_SNAP", () => {
    expect(applyRoundRating(500, 503)).toBe(503);
    expect(applyRoundRating(500, 497)).toBe(497);
    expect(applyRoundRating(999, 1000)).toBe(1000);
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
    expect(applyRoundRating(4200, 600)).toBe(600); // legacy -> coi nhu chua co
    expect(applyRoundRating(1001, 900)).toBe(972); // 1001 -> kep 1000 roi moi EMA
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

  it("khong phu thuoc don vi — day la diem mau chot", () => {
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

describe("decayRating — chi tiet duong cong", () => {
  it("khong dung gi trong thoi gian an han", () => {
    for (let d = 0; d <= DECAY_GRACE_DAYS; d++) {
      expect(decayRating(800, d)).toBe(800);
    }
  });

  it.skip("bat dau tru ngay ngay dau tien sau an han", () => {
    expect(decayRating(800, DECAY_GRACE_DAYS + 1)).toBe(798);
    expect(decayRating(800, 14)).toBe(784);
    expect(decayRating(800, 21)).toBe(768);
    expect(decayRating(800, 35)).toBe(738);
  });

  it.skip("khong bao gio roi duoi san", () => {
    expect(DECAY_FLOOR_RATIO).toBe(0.35);
    expect(decayRating(800, 3650)).toBe(280); // 800 * 0.35
    expect(decayRating(1000, 3650)).toBe(350);
    // Nghi ca doi cung khong mat het.
    expect(decayRating(800, 99999)).toBeGreaterThanOrEqual(280);
  });

  it("giam don dieu theo so ngay nghi", () => {
    let prev = decayRating(900, 0);
    for (let d = 1; d <= 400; d += 3) {
      const cur = decayRating(900, d);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it("khong hoi sinh du lieu rac", () => {
    expect(decayRating(0, 100)).toBe(0);
    expect(decayRating(-5, 100)).toBe(0);
    expect(decayRating(4200, 100)).toBe(0);
  });

  it.skip("toc do tru khop DECAY_PER_WEEK", () => {
    // Sau dung mot tuan qua han: mat 2%.
    expect(decayRating(1000, DECAY_GRACE_DAYS + 7)).toBe(
      Math.round(1000 * (1 - DECAY_PER_WEEK)),
    );
  });
});

describe("daysSince — moc ngay theo lich Viet Nam", () => {
  const now = new Date("2026-08-05T03:00:00.000Z"); // 10:00 ngay 5/8 gio VN

  it("dem so ngay lich tron", () => {
    expect(daysSince("2026-08-05", now)).toBe(0);
    expect(daysSince("2026-08-04", now)).toBe(1);
    expect(daysSince("2026-07-29", now)).toBe(7);
  });

  it("ngay tuong lai khong cho ra so am", () => {
    expect(daysSince("2026-08-10", now)).toBe(0);
  });

  it("dau vao rong hoac hong deu tra 0", () => {
    expect(daysSince(null, now)).toBe(0);
    expect(daysSince(undefined, now)).toBe(0);
    expect(daysSince("", now)).toBe(0);
    expect(daysSince("khong-phai-ngay", now)).toBe(0);
  });

  it("rang dong gio VN khong bi lech mot ngay", () => {
    // 18:00Z ngay 4/8 = 01:00 ngay 5/8 o Viet Nam. Neu parse o UTC thi ham se
    // tuong con la ngay 4 va tra ve 1 — dung cai bug tung lam mat streak.
    const raNgayMoi = new Date("2026-08-04T18:00:00.000Z");
    expect(daysSince("2026-08-05", raNgayMoi)).toBe(0);
    expect(daysSince("2026-08-04", raNgayMoi)).toBe(1);
  });
});

describe("hang so cau hinh", () => {
  it("giu nguyen gia tri ma cong thuc va migration dang dua vao", () => {
    expect([RATING_MIN, RATING_MAX]).toEqual([0, 1000]);
    expect(RATING_TOLERANCE).toBe(1.05);
    expect(RATING_SNAP).toBe(3);
    expect(EMA_ALPHA).toBe(0.4);
    expect(EMA_ALPHA_DOWN).toBe(0.28);
    expect(DECAY_GRACE_DAYS).toBe(7);
    expect(DECAY_PER_WEEK).toBe(0.02);
    expect(CALIBRATION_ROUNDS).toBe(5);
    expect(MAX_AGE_SWING).toBe(12);
    expect(MIN_POPULATION).toBe(8);
    expect(DEFAULT_POPULATION).toEqual({ mean: 380, sd: 180, n: 0 });
  });
});
