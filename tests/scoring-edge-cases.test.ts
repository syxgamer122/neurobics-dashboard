/**
 * CHOT HAI HANH VI LA TRONG scoring.ts
 *
 * File nay KHONG khang dinh hai hanh vi duoi day la dung. No chi CHOT lai dung
 * nhu code hien tai dang chay, kem giai thich vi sao. Muc dich:
 *
 *   - Neu ai do (nguoi hoac AI) "sua cho dep" mot trong hai cho nay, test do
 *     ngay va bat buoc phai doc phan giai thich truoc khi doi.
 *   - Neu sau nay quyet dinh sua that, chi can doi ky vong o day — luc do viec
 *     doi hanh vi la CO Y THUC, khong phai vo tinh.
 *
 * Moi con so trong file deu do bang cach chay that code, khong suy dien.
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

// ───────────────────────────────────────────────────────────────────────────
// HANH VI LA #1 — clampRating(NaN) tra ve NaN chu khong phai mot con so
// ───────────────────────────────────────────────────────────────────────────
//
// clampRating = Math.max(0, Math.min(1000, Math.round(n)))
//
// Voi n = NaN: Math.round(NaN) = NaN, va Math.max/Math.min gap NaN thi tra NaN.
// Nen ham mang ten "clamp" (ghim vao khoang) lai nha ra mot gia tri NGOAI
// khoang [0, 1000].
//
// Vi sao khong sua ngay: chua ro co duong nao thuc su bom NaN vao khong.
// sanitizeRating() — cua ngo doc du lieu tu database — DA chan NaN roi. Them
// mot guard nua co the che giau bug that o thuong nguon thay vi lam no lo ra.
// Doi nao bat duoc NaN that trong log thi sua tan goc cho do.

describe("HANH VI LA #1: clampRating khong chan NaN", () => {
  it("clampRating(NaN) tra ve NaN, khong phai 0", () => {
    // Day la cho "la". Neu ai sua thanh 0 thi dong nay do.
    expect(Number.isNaN(clampRating(NaN))).toBe(true);
    expect(Number.isNaN(clampRating(0 / 0))).toBe(true);
  });

  it("nhung Infinity thi LAI duoc ghim dung", () => {
    // Math.min(1000, Infinity) = 1000 -> khong ro ri. Chi rieng NaN mới lot.
    expect(clampRating(Infinity)).toBe(RATING_MAX);
    expect(clampRating(-Infinity)).toBe(RATING_MIN);
  });

  it("gia tri thuong van ghim dung", () => {
    expect(clampRating(-50)).toBe(0);
    expect(clampRating(0.5)).toBe(1);
    expect(clampRating(1000.4)).toBe(1000);
    expect(clampRating(1200)).toBe(1000);
  });

  it("clamp01 dinh cung mot van de", () => {
    expect(Number.isNaN(clamp01(NaN))).toBe(true);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it("DOI CHIEU: sanitizeRating thi co chan — day la ly do chua vá clampRating", () => {
    // sanitizeRating la cua ngo doc rating tu database. No kiem tra
    // Number.isFinite nen NaN va Infinity deu ve 0. Nho vay du lieu ban tu DB
    // khong bao gio den duoc clampRating duoi dang NaN.
    expect(sanitizeRating(NaN)).toBe(0);
    expect(sanitizeRating(Infinity)).toBe(0);
    expect(sanitizeRating(-Infinity)).toBe(0);
  });

  it("NaN o tham so `round` van chay xuyen qua applyRoundRating", () => {
    // Day la duong ro ri THAT SU con lai: `prev` duoc sanitizeRating() bao ve,
    // nhung `round` chi di qua clampRating() nen NaN se chay thang ra ngoai.
    expect(Number.isNaN(applyRoundRating(500, NaN))).toBe(true);

    // Nguoc lai, NaN o `prev` bi chan sach: sanitizeRating(NaN) = 0 -> coi nhu
    // cold start -> tra thang diem van dau.
    expect(applyRoundRating(NaN as unknown as number, 500)).toBe(500);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HANH VI LA #2 — applyRoundRating KHONG don dieu tai bien snap
// ───────────────────────────────────────────────────────────────────────────
//
// Logic hien tai:
//   gap = round - prev
//   |gap| <= RATING_SNAP (3)  ->  tra THANG round
//   gap > 0                   ->  prev + 0.4 * gap  (toi thieu +1)
//
// Hai nhanh nay khong noi lien nhau. Ngay tai bien:
//   gap = 3 -> nhanh snap  -> 503
//   gap = 4 -> nhanh EMA   -> 500 + 0.4*4 = 501.6 -> lam tron 502
//
// Ket qua: choi TOT HON (504 thay vi 503) lai duoc rating THAP HON. Nguoi choi
// khong the nhan ra, nhung ve mat toan hoc day la mot bat thuong that.
//
// Vi sao khong sua ngay: sua thi phai chon giua hai huong, va ca hai deu doi
// hanh vi cua toan bo he thong diem —
//   (a) bo snap di, moi thu chay EMA -> rating nhich cham hon han o giai doan
//       dau, anh huong truc tiep cam giac tien bo cua nguoi dung;
//   (b) giu snap nhung ep nhanh EMA khong duoc thap hon ket qua cua gap = 3
//       -> phai them mot rang buoc "san" moi, can do lai calibration.
// Ca hai deu la thay doi san pham, khong phai sua loi go nham. De lai quyet
// dinh sau, con bay gio chot lai cho khong ai vo tinh doi.

describe("HANH VI LA #2: applyRoundRating dao chieu tai bien snap", () => {
  it("choi tot hon 1 diem lai bi tru rating", () => {
    // Trai tim cua van de. Hai dong nay ma cung tang la hanh vi da doi.
    expect(applyRoundRating(500, 503)).toBe(503);
    expect(applyRoundRating(500, 504)).toBe(502);

    expect(applyRoundRating(500, 504)).toBeLessThan(applyRoundRating(500, 503));
  });

  it("co han mot vung chet: 504, 505, 506 deu cho ket qua kem hon 503", () => {
    expect(applyRoundRating(500, 504)).toBe(502);
    expect(applyRoundRating(500, 505)).toBe(502);
    expect(applyRoundRating(500, 506)).toBe(502);

    // Phai len toi 507 moi lay lai duoc muc cua 503.
    expect(applyRoundRating(500, 507)).toBe(503);
  });

  it("phia GIAM cung dao chieu tuong tu", () => {
    // Tut sau hon lai bi tru NHE hon: 497 mat 3 diem, con 496 chi mat 1.
    expect(applyRoundRating(500, 497)).toBe(497); // snap, mat 3
    expect(applyRoundRating(500, 496)).toBe(499); // EMA,  mat 1

    expect(applyRoundRating(500, 496)).toBeGreaterThan(
      applyRoundRating(500, 497),
    );
  });

  it("trong vung snap thi don dieu binh thuong", () => {
    // |gap| <= 3 -> tra thang round, nen doan nay khong co van de gi.
    const inSnap = [497, 498, 499, 500, 501, 502, 503];
    for (const round of inSnap) {
      expect(applyRoundRating(500, round)).toBe(round);
    }
    expect(RATING_SNAP).toBe(3);
  });

  it("ngoai vung snap, chenh lech cang lon thi cang don dieu tro lai", () => {
    // Bat thuong chi nam sat bien. Cach xa ra thi EMA chay dung nhu thiet ke.
    let prevOut = applyRoundRating(500, 510);
    for (const round of [520, 540, 600, 700, 900, 1000]) {
      const out = applyRoundRating(500, round);
      expect(out).toBeGreaterThan(prevOut);
      prevOut = out;
    }
  });

  it("cac duong di binh thuong khong doi", () => {
    // Cold start: van dau lam moc, khong EMA.
    expect(applyRoundRating(0, 700)).toBe(700);
    expect(applyRoundRating(null, 700)).toBe(700);
    expect(applyRoundRating(undefined, 700)).toBe(700);

    // Bang nhau thi giu nguyen.
    expect(applyRoundRating(500, 500)).toBe(500);

    // Keo len: 500 + 0.4 * 100 = 540.
    expect(applyRoundRating(500, 600)).toBe(540);
    expect(EMA_ALPHA).toBe(0.4);

    // Keo xuong cham hon: 500 + 0.28 * (-100) = 472.
    expect(applyRoundRating(500, 400)).toBe(472);
    expect(EMA_ALPHA_DOWN).toBe(0.28);

    // Mot van te hai khong danh sap rating.
    expect(applyRoundRating(700, -50)).toBe(504);

    // Ket qua luon nam trong [0, 1000].
    expect(applyRoundRating(998, 1000)).toBe(1000);
    expect(applyRoundRating(1, 0)).toBe(0);
    expect(applyRoundRating(2, 0)).toBe(0);
  });

  it("khong bao gio thoat khoi khoang hop le voi dau vao huu han", () => {
    for (const prev of [0, 1, 250, 500, 750, 999, 1000]) {
      for (const round of [0, 1, 250, 500, 750, 999, 1000]) {
        const out = applyRoundRating(prev, round);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(RATING_MIN);
        expect(out).toBeLessThanOrEqual(RATING_MAX);
        expect(Number.isInteger(out)).toBe(true);
      }
    }
  });
});
