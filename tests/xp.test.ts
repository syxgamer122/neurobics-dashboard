import { describe, expect, it } from "vitest";
import {
  MAX_XP_PER_ROUND,
  xpRequiredForLevel,
  levelFromXp,
  getLevelProgress,
  getLevelTitle,
  getLevelColor,
  calculateRoundXp,
} from "../src/app/lib/xp";

// Moi con so duoi day deu do bang cach CHAY THAT ham, khong suy dien tu cong
// thuc. Neu ai sua cong thuc XP thi test do se do va bat phai co chu y.

describe("xpRequiredForLevel", () => {
  it("tra ve nguong tich luy cua tung cap", () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(2)).toBe(100);
    expect(xpRequiredForLevel(3)).toBe(300);
    expect(xpRequiredForLevel(5)).toBe(1000);
    expect(xpRequiredForLevel(10)).toBe(4500);
    expect(xpRequiredForLevel(20)).toBe(19000);
    expect(xpRequiredForLevel(50)).toBe(122500);
  });

  it("kep cap ve toi thieu 1 va lam tron xuong", () => {
    expect(xpRequiredForLevel(0)).toBe(0);
    expect(xpRequiredForLevel(-3)).toBe(0);
    expect(xpRequiredForLevel(2.9)).toBe(100);
  });

  it("tang don dieu — cap sau luon dat hon cap truoc", () => {
    for (let l = 1; l < 60; l++) {
      expect(xpRequiredForLevel(l + 1)).toBeGreaterThan(xpRequiredForLevel(l));
    }
  });
});

describe("levelFromXp", () => {
  it("khop dung tai cac diem chuyen cap", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(299)).toBe(2);
    expect(levelFromXp(300)).toBe(3);
    expect(levelFromXp(600)).toBe(4);
    expect(levelFromXp(1000)).toBe(5);
    expect(levelFromXp(1500)).toBe(6);
    expect(levelFromXp(2100)).toBe(7);
    expect(levelFromXp(2800)).toBe(8);
  });

  it("chiu duoc XP am", () => {
    expect(levelFromXp(-500)).toBe(1);
  });

  it("van chay o XP rat lon", () => {
    expect(levelFromXp(5000)).toBe(10);
    expect(levelFromXp(100000)).toBe(45);
  });

  it("la ham nghich dao cua xpRequiredForLevel", () => {
    // Dung dung nguong thi phai vao cap do; thieu 1 XP thi con o cap truoc.
    for (let l = 2; l <= 40; l++) {
      const need = xpRequiredForLevel(l);
      expect(levelFromXp(need)).toBe(l);
      expect(levelFromXp(need - 1)).toBe(l - 1);
    }
  });
});

describe("getLevelProgress", () => {
  it("mo ta day du tien do giua hai nguong", () => {
    expect(getLevelProgress(150)).toEqual({
      level: 2,
      totalXp: 150,
      currentThreshold: 100,
      nextThreshold: 300,
      xpIntoLevel: 50,
      xpNeeded: 200,
      progress: 0.25,
    });
  });

  it("progress = 0 ngay khi vua len cap", () => {
    expect(getLevelProgress(0).progress).toBe(0);
    expect(getLevelProgress(2800).progress).toBe(0);
    expect(getLevelProgress(2800).level).toBe(8);
  });

  it("progress luon nam trong [0, 1)", () => {
    for (const xp of [0, 1, 99, 100, 555, 4499, 4500, 99999]) {
      const pr = getLevelProgress(xp).progress;
      expect(pr).toBeGreaterThanOrEqual(0);
      expect(pr).toBeLessThan(1);
    }
  });
});

describe("getLevelTitle / getLevelColor", () => {
  it("doi danh hieu dung tai nguong", () => {
    expect(getLevelTitle(1)).toBe("Novice");
    expect(getLevelTitle(4)).toBe("Novice");
    expect(getLevelTitle(5)).toBe("Explorer");
    expect(getLevelTitle(9)).toBe("Explorer");
    expect(getLevelTitle(10)).toBe("Thinker");
    expect(getLevelTitle(19)).toBe("Thinker");
    expect(getLevelTitle(20)).toBe("Strategist");
    expect(getLevelTitle(34)).toBe("Strategist");
    expect(getLevelTitle(35)).toBe("Neural Master");
    expect(getLevelTitle(49)).toBe("Neural Master");
    expect(getLevelTitle(50)).toBe("Neuro Sage");
    expect(getLevelTitle(999)).toBe("Neuro Sage");
  });

  it("mau di kem tung danh hieu", () => {
    expect(getLevelColor(1)).toBe("#94A3B8");
    expect(getLevelColor(5)).toBe("#10B981");
    expect(getLevelColor(10)).toBe("#00D4FF");
    expect(getLevelColor(20)).toBe("#A855F7");
    expect(getLevelColor(35)).toBe("#F59E0B");
    expect(getLevelColor(50)).toBe("#F43F5E");
  });

  it("danh hieu va mau doi cung mot luc", () => {
    // Hai ham dung chung bo nguong; lech nhau la loi hien thi kho thay.
    let prevTitle = getLevelTitle(1);
    let prevColor = getLevelColor(1);
    for (let l = 2; l <= 60; l++) {
      const title = getLevelTitle(l);
      const color = getLevelColor(l);
      expect(title !== prevTitle).toBe(color !== prevColor);
      prevTitle = title;
      prevColor = color;
    }
  });
});

describe("calculateRoundXp", () => {
  it("san 15 XP, thuong them 1 XP moi 50 diem", () => {
    expect(calculateRoundXp(0)).toBe(15);
    expect(calculateRoundXp(49)).toBe(15);
    expect(calculateRoundXp(50)).toBe(16);
    expect(calculateRoundXp(250)).toBe(20);
    expect(calculateRoundXp(500)).toBe(25);
    expect(calculateRoundXp(999)).toBe(34);
  });

  it("khong bao gio vuot tran moi van", () => {
    expect(calculateRoundXp(1000)).toBe(MAX_XP_PER_ROUND);
    expect(calculateRoundXp(5000)).toBe(MAX_XP_PER_ROUND);
    for (let s = 0; s <= 1000; s += 7) {
      expect(calculateRoundXp(s)).toBeLessThanOrEqual(MAX_XP_PER_ROUND);
    }
  });

  it("diem am van duoc XP san — khong bao gio am", () => {
    expect(calculateRoundXp(-100)).toBe(15);
    expect(calculateRoundXp(-1)).toBe(15);
  });

  it("khong giam khi diem tang", () => {
    let prev = calculateRoundXp(0);
    for (let s = 1; s <= 1000; s++) {
      const cur = calculateRoundXp(s);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});
