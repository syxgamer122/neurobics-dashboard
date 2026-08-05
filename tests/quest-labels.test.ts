import { describe, expect, it } from "vitest";
import {
  QUEST_LABELS,
  humanizeQuestCode,
  resolveQuestLabel,
} from "../src/app/lib/quest-labels";

// Luat bat bien cua module nay ghi ngay dau file: giao dien KHONG BAO GIO duoc
// hien ma ky thuat (vd. w_games_7). Mot ma lech ra ngoai la mot dong chu vo
// nghia hien len man hinh nguoi dung — va khong co gi bao loi, vi fallback rat
// im lang. Nen test chu yeu khoa cac duong di toi fallback va bang danh muc.

describe("QUEST_LABELS — tinh toan ven cua danh muc", () => {
  const codes = Object.keys(QUEST_LABELS);

  it("co dung 22 ma: 18 ngay + 4 tuan", () => {
    expect(codes).toHaveLength(22);
    expect(codes.filter((c) => c.startsWith("q_"))).toHaveLength(18);
    expect(codes.filter((c) => c.startsWith("w_"))).toHaveLength(4);
  });

  it("khong co ma trung", () => {
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("ma viet thuong dang snake_case", () => {
    // Ma phai khop y het chuoi Postgres tra ve.
    for (const c of codes) {
      expect(c, `ma sai dinh dang: ${c}`).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("moi ma deu co du tieng Viet va tieng Anh, khong rong", () => {
    for (const [code, label] of Object.entries(QUEST_LABELS)) {
      expect(
        label.vi.trim().length,
        `${code} thieu tieng Viet`,
      ).toBeGreaterThan(0);
      expect(label.en.trim().length, `${code} thieu tieng Anh`).toBeGreaterThan(
        0,
      );
    }
  });

  it("khong quen dich — hai thu tieng phai khac nhau", () => {
    const chuaDich = Object.entries(QUEST_LABELS).filter(
      ([, l]) => l.vi === l.en,
    );
    expect(chuaDich.map(([c]) => c)).toEqual([]);
  });

  it("moi ma trong danh muc deu parse duoc bang humanize", () => {
    // Neu ma khong khop mau nao, humanize tra "Nhiem vu" — tuc danh muc dang
    // chua mot ma lech chuan, va RPC tra ma do ma mat server title thi nguoi
    // dung chi thay chu "Nhiem vu" vo nghia.
    for (const c of codes) {
      expect(humanizeQuestCode(c, "vi"), `${c} khong parse duoc`).not.toBe(
        "Nhiệm vụ",
      );
      expect(humanizeQuestCode(c, "en"), `${c} khong parse duoc`).not.toBe(
        "Quest",
      );
    }
  });
});

describe("humanizeQuestCode — dich tu cau truc ma", () => {
  it("rounds_N", () => {
    expect(humanizeQuestCode("q_rounds_3", "vi")).toBe("Chơi 3 ván");
    expect(humanizeQuestCode("q_rounds_3", "en")).toBe("Play 3 rounds");
    expect(humanizeQuestCode("q_rounds_99", "vi")).toBe("Chơi 99 ván");
    expect(humanizeQuestCode("q_rounds_99", "en")).toBe("Play 99 rounds");
  });

  it("score_N va score_N_M", () => {
    expect(humanizeQuestCode("q_score_600", "vi")).toBe(
      "Đạt 600+ trong một ván",
    );
    expect(humanizeQuestCode("q_score_600", "en")).toBe(
      "Score 600+ in one round",
    );
    expect(humanizeQuestCode("q_score_750_2", "vi")).toBe(
      "Đạt 750+ trong 2 ván",
    );
    expect(humanizeQuestCode("q_score_750_2", "en")).toBe(
      "Score 750+ in 2 rounds",
    );
  });

  it("games_N", () => {
    expect(humanizeQuestCode("q_games_2", "vi")).toBe("Chơi 2 trò khác nhau");
    expect(humanizeQuestCode("q_games_2", "en")).toBe("Play 2 different games");
  });

  it("play_<tro>_N voi tro da biet", () => {
    expect(humanizeQuestCode("q_play_schulte_2", "vi")).toBe(
      "Chơi Schulte 2 ván",
    );
    expect(humanizeQuestCode("q_play_schulte_2", "en")).toBe(
      "Play 2 Schulte rounds",
    );
    expect(humanizeQuestCode("q_play_math_5", "vi")).toBe(
      "Chơi Math Sprint 5 ván",
    );
    expect(humanizeQuestCode("q_play_corsi_3", "en")).toBe(
      "Play 3 Corsi Block rounds",
    );
  });

  it("play_<tro>_N voi tro chua biet van doc duoc", () => {
    // Them tro moi vao Postgres ma quen cap nhat client: nguoi dung van thay
    // ten tro tho chu khong thay ma ky thuat.
    expect(humanizeQuestCode("q_play_tetris_2", "vi")).toBe(
      "Chơi tetris 2 ván",
    );
    expect(humanizeQuestCode("q_play_tetris_2", "en")).toBe(
      "Play 2 tetris rounds",
    );
  });

  it("tien to w_ them nhan tuan", () => {
    expect(humanizeQuestCode("w_rounds_25", "vi")).toBe("Tuần: chơi 25 ván");
    expect(humanizeQuestCode("w_rounds_25", "en")).toBe(
      "Weekly: play 25 rounds",
    );
    expect(humanizeQuestCode("w_score_900_3", "vi")).toBe(
      "Tuần: đạt 900+ trong 3 ván",
    );
    expect(humanizeQuestCode("w_games_7", "en")).toBe(
      "Weekly: play 7 different games",
    );
  });

  it("chu cai dau luon viet hoa", () => {
    for (const c of ["q_rounds_3", "w_games_7", "q_score_600"]) {
      for (const lang of ["vi", "en"] as const) {
        const label = humanizeQuestCode(c, lang);
        expect(label[0]).toBe(label[0].toUpperCase());
      }
    }
  });
});

describe("humanizeQuestCode — dau vao xau khong bao gio tra ma tho", () => {
  it("rong, null, so deu ve nhan generic", () => {
    for (const xau of ["", "   ", null, undefined, 123, "q_1"] as Array<
      string | null | undefined | number
    >) {
      expect(humanizeQuestCode(xau as string, "vi")).toBe("Nhiệm vụ");
      expect(humanizeQuestCode(xau as string, "en")).toBe("Quest");
    }
  });

  it("ma khong khop mau thi bo gach duoi cho de doc", () => {
    expect(humanizeQuestCode("q_khong_ro_y_nghia", "vi")).toBe(
      "Khong ro y nghia",
    );
    expect(humanizeQuestCode("w_ab_2", "vi")).toBe("Tuần: ab 2");
  });

  it("CHU Y: parse co phan biet hoa thuong", () => {
    // "Q_ROUNDS_3" viet hoa khong khop mau nao -> roi xuong nhanh bo gach duoi.
    // Day la hanh vi hien tai, test khoa lai de ai muon doi sang khong phan
    // biet hoa thuong phai sua test mot cach co y thuc.
    expect(humanizeQuestCode("Q_ROUNDS_3", "vi")).toBe("Q ROUNDS 3");
    expect(humanizeQuestCode("q_rounds_x", "vi")).toBe("Rounds x");
  });
});

describe("resolveQuestLabel — thu tu uu tien", () => {
  it("server title dung dau, ke ca khi co trong danh muc", () => {
    expect(resolveQuestLabel("q_rounds_3", "vi", "Ten tu server")).toBe(
      "Ten tu server",
    );
  });

  it("server title trung dung ma thi bo qua", () => {
    // RPC tra title = code nghia la server khong co ten that.
    expect(resolveQuestLabel("q_rounds_3", "vi", "q_rounds_3")).toBe(
      "Khởi động: chơi 3 ván",
    );
  });

  it("server title rong/null/khoang trang thi xuong danh muc", () => {
    for (const t of ["", null, "   "] as Array<string | null>) {
      expect(resolveQuestLabel("q_rounds_3", "vi", t)).toBe(
        "Khởi động: chơi 3 ván",
      );
    }
  });

  it("danh muc dung thu hai", () => {
    expect(resolveQuestLabel("q_rounds_3", "vi")).toBe("Khởi động: chơi 3 ván");
    expect(resolveQuestLabel("w_score_800_5", "en")).toBe(
      "Weekly: 5 rounds at 800+",
    );
  });

  it("ma khong co trong danh muc thi humanize", () => {
    expect(resolveQuestLabel("q_rounds_42", "vi")).toBe("Chơi 42 ván");
  });

  it("duong cuoi cung: nhan generic, tuyet doi khong tra ma tho", () => {
    expect(resolveQuestLabel("q_z9", "vi")).toBe("Nhiệm vụ");
    expect(resolveQuestLabel("q_z9", "en")).toBe("Quest");
    expect(resolveQuestLabel("q_1", "vi")).toBe("Nhiệm vụ");
  });

  it("khong co duong nao tra lai dung ma dau vao", () => {
    const mauThu = [
      "q_rounds_3",
      "w_games_7",
      "q_score_850",
      "q_play_nback_2",
      "q_khong_co_trong_map",
      "q_1",
      "",
    ];
    for (const c of mauThu) {
      for (const lang of ["vi", "en"] as const) {
        expect(resolveQuestLabel(c, lang)).not.toBe(c);
      }
    }
  });
});
