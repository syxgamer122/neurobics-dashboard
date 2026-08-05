// XP va Level: thang bac cong don + XP moi van dau.
//
// Vi sao dang gia: levelFromXp dung cong thuc nghich dao co can bac hai, con
// xpRequiredForLevel la cong thuc thuan. Neu mot trong hai bi sua ma khong sua
// cai kia, nguoi dung se thay level nhay lui hoac thanh tien do am - loai bug
// rat kho phat hien bang mat.
import { describe, expect, it } from "vitest";
import {
  MAX_XP_PER_ROUND,
  calculateRoundXp,
  getLevelColor,
  getLevelProgress,
  getLevelTitle,
  levelFromXp,
  xpRequiredForLevel,
} from "../src/app/lib/xp";

describe("xpRequiredForLevel", () => {
  it("thang bac cong don co dinh", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => xpRequiredForLevel(l))).toEqual([
      0, 100, 300, 600, 1000, 1500, 2100, 2800,
    ]);
  });

  it("level duoi 1 bi ket ve 1, so thuc bi lam tron xuong", () => {
    expect(xpRequiredForLevel(0)).toBe(0);
    expect(xpRequiredForLevel(-9)).toBe(0);
    expect(xpRequiredForLevel(2.9)).toBe(100);
  });
});

describe("levelFromXp", () => {
  it("moc chuyen level dung tai ranh gioi", () => {
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 1],
      [99, 1],
      [100, 2],
      [101, 2],
      [299, 2],
      [300, 3],
      [600, 4],
      [1000, 5],
      [5000, 10],
      [100000, 45],
    ];
    for (const [xp, level] of pairs) {
      expect(levelFromXp(xp)).toBe(level);
    }
  });

  it("XP am duoc coi la 0, khong bao gio ra level 0 hay am", () => {
    expect(levelFromXp(-500)).toBe(1);
    expect(levelFromXp(-1)).toBe(1);
  });

  // Day la bai kiem tra quan trong nhat cua file: hai cong thuc phai la nghich
  // dao that su cua nhau tren toan bo dai level nguoi dung co the dat duoc.
  it("nghich dao khop nhau tren level 1..80 (ca hai phia ranh gioi)", () => {
    for (let level = 1; level <= 80; level++) {
      const need = xpRequiredForLevel(level);
      expect(levelFromXp(need)).toBe(level);
      if (need > 0) {
        expect(levelFromXp(need - 1)).toBe(level - 1);
      }
    }
  });
});

describe("getLevelProgress", () => {
  it("nguoi dung moi: level 1, tien do 0", () => {
    expect(getLevelProgress(0)).toEqual({
      level: 1,
      totalXp: 0,
      currentThreshold: 0,
      nextThreshold: 100,
      xpIntoLevel: 0,
      xpNeeded: 100,
      progress: 0,
    });
  });

  it("giua level 2: tien do la phan da di trong level hien tai", () => {
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

  it("dung tai nguong: tien do ve 0 chu khong phai 1", () => {
    const p = getLevelProgress(100);
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.progress).toBe(0);
  });

  it("tien do luon nam trong [0, 1)", () => {
    for (const xp of [0, 1, 99, 100, 250, 999, 1000, 4321, 100000]) {
      const p = getLevelProgress(xp);
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThan(1);
    }
  });
});

describe("nhan va mau theo level", () => {
  it("nhan doi dung tai moc 5/10/20/35/50", () => {
    const pairs: Array<[number, string]> = [
      [1, "Novice"],
      [4, "Novice"],
      [5, "Explorer"],
      [9, "Explorer"],
      [10, "Thinker"],
      [19, "Thinker"],
      [20, "Strategist"],
      [34, "Strategist"],
      [35, "Neural Master"],
      [49, "Neural Master"],
      [50, "Neuro Sage"],
      [99, "Neuro Sage"],
    ];
    for (const [level, title] of pairs) {
      expect(getLevelTitle(level)).toBe(title);
    }
  });

  it("mau doi dung tai cung cac moc do", () => {
    const pairs: Array<[number, string]> = [
      [1, "#94A3B8"],
      [5, "#10B981"],
      [10, "#00D4FF"],
      [20, "#A855F7"],
      [35, "#F59E0B"],
      [50, "#F43F5E"],
    ];
    for (const [level, color] of pairs) {
      expect(getLevelColor(level)).toBe(color);
    }
  });
});

describe("calculateRoundXp", () => {
  it("san 15 XP, cong thuong theo tung 50 diem", () => {
    const pairs: Array<[number, number]> = [
      [0, 15],
      [49, 15],
      [50, 16],
      [250, 20],
      [500, 25],
      [999, 34],
      [1000, 35],
    ];
    for (const [score, want] of pairs) {
      expect(calculateRoundXp(score)).toBe(want);
    }
  });

  it("khong the vuot tran, khong the am", () => {
    expect(calculateRoundXp(1000)).toBe(MAX_XP_PER_ROUND);
    expect(calculateRoundXp(1500)).toBe(MAX_XP_PER_ROUND);
    expect(calculateRoundXp(999999)).toBe(MAX_XP_PER_ROUND);
    expect(calculateRoundXp(-100)).toBe(15);
  });

  it("khong giam khi diem tang (don dieu)", () => {
    let prev = calculateRoundXp(0);
    for (let score = 0; score <= 1000; score += 10) {
      const xp = calculateRoundXp(score);
      expect(xp).toBeGreaterThanOrEqual(prev);
      expect(xp).toBeLessThanOrEqual(MAX_XP_PER_ROUND);
      prev = xp;
    }
  });
});
