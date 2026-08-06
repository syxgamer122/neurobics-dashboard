/**
 * Regression tests cho hai bien da tung lam rating khong hop le:
 *
 * 1. NaN / Infinity di xuyen qua clamp va lam hong rating.
 * 2. Nhanh snap va EMA khong noi lien nhau, nen diem vong cao hon co the tao
 *    rating thap hon ngay sat bien RATING_SNAP.
 *
 * Day la test cho HOP DONG MONG MUON sau khi va, khong con khoa bug cu lai.
 */

import { describe, expect, it } from "vitest";
import {
  clampRating,
  clamp01,
  sanitizeRating,
  applyRoundRating,
  RATING_MIN,
  RATING_MAX,
  RATING_SNAP,
  EMA_ALPHA,
  EMA_ALPHA_DOWN,
} from "../src/app/lib/scoring";

describe("non-finite input — khong duoc lam hong rating", () => {
  it("clampRating dua moi gia tri khong huu han ve moc an toan", () => {
    expect(clampRating(NaN)).toBe(RATING_MIN);
    expect(clampRating(Infinity)).toBe(RATING_MIN);
    expect(clampRating(-Infinity)).toBe(RATING_MIN);
  });

  it("clamp01 dua moi gia tri khong huu han ve 0", () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
  });

  it("diem vong hong giu nguyen rating cu thay vi phat nguoi choi", () => {
    expect(applyRoundRating(500, NaN)).toBe(500);
    expect(applyRoundRating(500, Infinity)).toBe(500);
    expect(applyRoundRating(500, -Infinity)).toBe(500);
  });

  it("cold start + diem hong tra ve moc 0 hop le", () => {
    expect(applyRoundRating(null, NaN)).toBe(0);
    expect(applyRoundRating(undefined, Infinity)).toBe(0);
  });

  it("prev hong van duoc sanitize truoc khi dung", () => {
    expect(applyRoundRating(NaN as unknown as number, 500)).toBe(500);
    expect(sanitizeRating(NaN)).toBe(0);
  });
});

describe("snap + EMA — don dieu tren toan mien diem", () => {
  it("giu nguyen quy tac snap trong khoang 3 diem", () => {
    expect(RATING_SNAP).toBe(3);
    expect(applyRoundRating(500, 497)).toBe(497);
    expect(applyRoundRating(500, 498)).toBe(498);
    expect(applyRoundRating(500, 502)).toBe(502);
    expect(applyRoundRating(500, 503)).toBe(503);
  });

  it("khong con dao chieu ngay ngoai bien tang", () => {
    expect(applyRoundRating(500, 503)).toBe(503);
    expect(applyRoundRating(500, 504)).toBe(503);

    // Plateau la hop le; dieu khong hop le la output di lui khi input tang.
    for (const round of [504, 505, 506, 507, 508]) {
      expect(applyRoundRating(500, round)).toBe(503);
    }
    expect(applyRoundRating(500, 509)).toBe(504);
  });

  it("khong con dao chieu ngay ngoai bien giam", () => {
    expect(applyRoundRating(500, 496)).toBe(497);
    expect(applyRoundRating(500, 497)).toBe(497);
    expect(applyRoundRating(500, 487)).toBe(496);
  });

  it("don dieu voi moi round 0..1000 tai nhieu rating goc", () => {
    for (const prev of [0, 1, 2, 250, 500, 750, 998, 999, 1000]) {
      let last = -Infinity;
      for (let round = RATING_MIN; round <= RATING_MAX; round++) {
        const out = applyRoundRating(prev, round);
        expect(out).toBeGreaterThanOrEqual(last);
        last = out;
      }
    }
  });

  it("khong vuot qua khoang giua rating cu va diem vong", () => {
    for (const prev of [1, 250, 500, 750, 999]) {
      for (const round of [0, 1, 100, 497, 500, 503, 900, 1000]) {
        const out = applyRoundRating(prev, round);
        expect(out).toBeGreaterThanOrEqual(Math.min(prev, round));
        expect(out).toBeLessThanOrEqual(Math.max(prev, round));
      }
    }
  });

  it("cac duong EMA binh thuong khong doi", () => {
    expect(applyRoundRating(500, 600)).toBe(540);
    expect(applyRoundRating(500, 400)).toBe(472);
    expect(EMA_ALPHA).toBe(0.4);
    expect(EMA_ALPHA_DOWN).toBe(0.28);
  });

  it("dau vao huu han luon cho so nguyen trong [0, 1000]", () => {
    for (const prev of [0, 1, 250, 500, 750, 999, 1000]) {
      for (const round of [0, 1, 250, 500, 750, 999, 1000]) {
        const out = applyRoundRating(prev, round);
        expect(Number.isFinite(out)).toBe(true);
        expect(Number.isInteger(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(RATING_MIN);
        expect(out).toBeLessThanOrEqual(RATING_MAX);
      }
    }
  });
});
