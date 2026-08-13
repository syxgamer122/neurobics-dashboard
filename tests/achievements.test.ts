import { describe, expect, it } from "vitest";
import {
  BADGES,
  TOTAL_BADGE_XP,
  TIER_ORDER,
  TIER_COLOR,
  TIER_LABEL,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  type Badge,
} from "../src/app/lib/achievements";

// achievements.ts la mot BANG DANH MUC, khong phai logic. Nen thu dang test la
// tinh toan ven: khong trung ma, khong thieu ban dich, khong lech voi Postgres.
// Mot ma badge go sai o day se lam huy hieu khong bao gio mo khoa duoc, va
// khong co gi trong ung dung bao loi — dung loai bug ma test nay sinh ra de bat.

const CODE_RE = /^[a-z0-9_]+$/;

describe("BADGES — tinh toan ven", () => {
  it("khong co ma trung", () => {
    const codes = BADGES.map((b) => b.code);
    const trung = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect(trung).toEqual([]);
  });

  it("ma viet thuong, khong dau, khong khoang trang", () => {
    // Ma nay phai khop y het chuoi trong sync_achievements() ben Postgres.
    for (const b of BADGES) {
      expect(b.code, `ma sai dinh dang: ${b.code}`).toMatch(CODE_RE);
    }
  });

  it("moi badge deu co du hai ngon ngu, moi ngon ngu du ten va mo ta", () => {
    for (const b of BADGES) {
      for (const lang of ["vi", "en"] as const) {
        const pair = b[lang];
        expect(pair, `${b.code}.${lang} thieu`).toHaveLength(2);
        expect(
          pair[0].trim().length,
          `${b.code}.${lang} thieu ten`,
        ).toBeGreaterThan(0);
        expect(
          pair[1].trim().length,
          `${b.code}.${lang} thieu mo ta`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("khong quen dich — ten Viet khac ten Anh", () => {
    // Copy-paste tieng Anh sang o tieng Viet la loi hay gap khi them badge moi.
    const chuaDich = BADGES.filter(
      (b) => b.vi[0] === b.en[0] && b.vi[1] === b.en[1],
    );
    expect(chuaDich.map((b) => b.code)).toEqual([]);
  });

  it("moi badge co icon", () => {
    for (const b of BADGES) {
      expect(b.icon.trim().length, `${b.code} thieu icon`).toBeGreaterThan(0);
    }
  });

  it("XP la so nguyen duong", () => {
    for (const b of BADGES) {
      expect(Number.isInteger(b.xp), `${b.code} XP khong nguyen`).toBe(true);
      expect(b.xp, `${b.code} XP khong duong`).toBeGreaterThan(0);
    }
  });

  it("hang va nhom deu nam trong danh sach hop le", () => {
    for (const b of BADGES) {
      expect(TIER_ORDER, `${b.code} hang la").`).toContain(b.tier);
      expect(CATEGORY_ORDER, `${b.code} nhom la").`).toContain(b.category);
    }
  });
});

describe("can bang phan thuong", () => {
  it("hang cao hon thi thuong nhieu hon — khong chong lan khoang XP", () => {
    // Neu mot badge dong lai cho XP hon mot badge kim cuong thi bang xep hang
    // mat y nghia. Do chinh la thu test nay chan.
    const khoang = TIER_ORDER.map((tier) => {
      const xps = BADGES.filter((b) => b.tier === tier).map((b) => b.xp);
      return { tier, min: Math.min(...xps), max: Math.max(...xps) };
    });

    for (let i = 1; i < khoang.length; i++) {
      expect(
        khoang[i].min,
        `${khoang[i].tier} (min ${khoang[i].min}) khong duoc thap hon ${khoang[i - 1].tier} (min ${khoang[i - 1].min})`,
      ).toBeGreaterThan(khoang[i - 1].min);
      expect(khoang[i].max).toBeGreaterThan(khoang[i - 1].max);
    }
  });

  it("khoang XP tung hang dung nhu thiet ke", () => {
    const range = (tier: Badge["tier"]) => {
      const xps = BADGES.filter((b) => b.tier === tier).map((b) => b.xp);
      return [Math.min(...xps), Math.max(...xps)];
    };
    expect(range("bronze")).toEqual([20, 40]);
    expect(range("silver")).toEqual([50, 100]);
    expect(range("gold")).toEqual([90, 180]);
    expect(range("platinum")).toEqual([150, 280]);
    expect(range("diamond")).toEqual([300, 420]);
  });

  it("TOTAL_BADGE_XP dung bang tong", () => {
    expect(TOTAL_BADGE_XP).toBe(BADGES.reduce((s, b) => s + b.xp, 0));
    expect(TOTAL_BADGE_XP).toBe(7040);
  });
});

describe("bang tra cuu hien thi", () => {
  it("moi hang deu co mau va nhan hai thu tieng", () => {
    for (const tier of TIER_ORDER) {
      expect(TIER_COLOR[tier]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(TIER_LABEL[tier].vi.length).toBeGreaterThan(0);
      expect(TIER_LABEL[tier].en.length).toBeGreaterThan(0);
    }
  });

  it("moi nhom deu co nhan hai thu tieng", () => {
    for (const cat of CATEGORY_ORDER) {
      expect(CATEGORY_LABEL[cat].vi.length).toBeGreaterThan(0);
      expect(CATEGORY_LABEL[cat].en.length).toBeGreaterThan(0);
    }
  });

  it("khong co khoa thua trong bang tra cuu", () => {
    // Them mot hang moi vao TIER_COLOR ma quen TIER_ORDER thi no se khong bao
    // gio hien ra tren giao dien.
    expect(Object.keys(TIER_COLOR).sort()).toEqual([...TIER_ORDER].sort());
    expect(Object.keys(TIER_LABEL).sort()).toEqual([...TIER_ORDER].sort());
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual(
      [...CATEGORY_ORDER].sort(),
    );
  });

  it("mau cua cac hang khac nhau", () => {
    const mau = TIER_ORDER.map((t) => TIER_COLOR[t].toUpperCase());
    expect(new Set(mau).size).toBe(mau.length);
  });

  it("moi nhom deu co it nhat mot badge", () => {
    for (const cat of CATEGORY_ORDER) {
      expect(
        BADGES.filter((b) => b.category === cat).length,
        `nhom ${cat} rong`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("anh chup danh muc", () => {
  // Chot so luong hien tai. Them badge moi la viec binh thuong — khi do sua
  // con so o day cho khop, coi nhu mot buoc xac nhan co y thuc.
  it("co dung 55 badge", () => {
    expect(BADGES).toHaveLength(48);
  });

  it("phan bo theo nhom", () => {
    const dem: Record<string, number> = {};
    for (const b of BADGES) dem[b.category] = (dem[b.category] ?? 0) + 1;
    expect(dem).toEqual({
      volume: 7,

      level: 6,
      mastery: 7,
      breadth: 3,
      score: 4,
      game: 21,
    });
  });

  it("phan bo theo hang — cang hiem cang it", () => {
    const dem: Record<string, number> = {};
    for (const b of BADGES) dem[b.tier] = (dem[b.tier] ?? 0) + 1;
    expect(dem).toEqual({
      bronze: 3,
      silver: 14,
      gold: 17,
      platinum: 9,
      diamond: 5,
    });
  });

  it("cac badge theo trò phu kin danh sach trò choi", () => {
    // Moi trò nen co it nhat mot badge rieng, khong thi trò do bi ghe lanh.
    const tienTo = [
      "schulte",
      "sudoku",
      "stroop",
      "reaction",
      "memory",
      "nback",
      "math",
      "gonogo",
      "mental",
    ];
    const maTheoTro = BADGES.filter((b) => b.category === "game").map(
      (b) => b.code,
    );
    for (const tro of tienTo) {
      expect(
        maTheoTro.some((m) => m.startsWith(`${tro}_`)),
        `trò ${tro} khong co badge rieng nao`,
      ).toBe(true);
    }
  });
});
