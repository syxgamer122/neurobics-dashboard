import { describe, expect, it } from "vitest";
import {
  assertRtBounds,
  assertCountBounds,
} from "../supabase/functions/_shared/scoring/validation";

// Day la cua khau: moi telemetry tu trinh duyet deu di qua hai ham nay truoc
// khi duoc cham diem. Bo sot mot dieu kien o day nghia la nguoi choi tu khai
// duoc diem — nen test bam sat tung thong bao loi.

const OK_ELAPSED = 60_000;

describe("assertRtBounds", () => {
  it("bo qua khi khong co du lieu", () => {
    expect(() => assertRtBounds(null, OK_ELAPSED, "schulte")).not.toThrow();
    expect(() =>
      assertRtBounds(undefined, OK_ELAPSED, "schulte"),
    ).not.toThrow();
  });

  it("chap nhan mang rong va mang hop le", () => {
    expect(() => assertRtBounds([], OK_ELAPSED, "schulte")).not.toThrow();
    expect(() =>
      assertRtBounds([100, 250, 900], OK_ELAPSED, "schulte"),
    ).not.toThrow();
  });

  it("tu choi thu khong phai mang", () => {
    expect(() => assertRtBounds("123", OK_ELAPSED, "schulte")).toThrow(
      "schulte: rts must be an array",
    );
    expect(() => assertRtBounds({ 0: 100 }, OK_ELAPSED, "schulte")).toThrow(
      "rts must be an array",
    );
  });

  it("tu choi phan tu khong phai so huu han", () => {
    for (const xau of [["100"], [null], [undefined], [NaN], [Infinity], [{}]]) {
      expect(() => assertRtBounds(xau, OK_ELAPSED, "stroop")).toThrow(
        "stroop: reaction time is not a number",
      );
    }
  });

  it("chan phan xa nhanh hon con nguoi (< 80ms)", () => {
    expect(() => assertRtBounds([79], OK_ELAPSED, "reaction")).toThrow(
      "reaction: reaction time below human threshold",
    );
    expect(() => assertRtBounds([0], OK_ELAPSED, "reaction")).toThrow(
      "below human threshold",
    );
    expect(() => assertRtBounds([-5], OK_ELAPSED, "reaction")).toThrow(
      "below human threshold",
    );
    // Dung 80ms van duoc — nguong la "nho hon", khong phai "nho hon hoac bang".
    expect(() => assertRtBounds([80], OK_ELAPSED, "reaction")).not.toThrow();
  });

  it("chan do tre vo ly (> 60 giay)", () => {
    expect(() => assertRtBounds([60_001], 999_999_999, "sudoku")).toThrow(
      "sudoku: reaction time out of range",
    );
    expect(() => assertRtBounds([60_000], 999_999_999, "sudoku")).not.toThrow();
  });

  it("chan mang qua dai (> 5000 phan tu)", () => {
    const qua = new Array(5_001).fill(100);
    expect(() => assertRtBounds(qua, 999_999_999, "trail")).toThrow(
      "trail: too many reaction times",
    );
    const vua = new Array(5_000).fill(100);
    expect(() => assertRtBounds(vua, 999_999_999, "trail")).not.toThrow();
  });

  it("tong do tre khong duoc vuot thoi luong van dau", () => {
    // Day la chot chan quan trong nhat: khai bao 100 luot moi luot 1 giay nhung
    // van chi keo dai 10 giay la khong the co that.
    const rts = new Array(100).fill(1_000); // tong 100 giay
    expect(() => assertRtBounds(rts, 10_000, "nback")).toThrow(
      "nback: sum of reaction times exceeds round duration",
    );
  });

  it("cho phep dem bien 15 giay", () => {
    // Dong ho may khach va may chu khong bao gio khop tuyet doi.
    expect(() => assertRtBounds([20_000], 10_000, "nback")).not.toThrow();
    expect(() => assertRtBounds([25_001], 10_000, "nback")).toThrow(
      "exceeds round duration",
    );
  });

  it("nhan loi luon mang ten tro choi", () => {
    expect(() => assertRtBounds([1], 0, "trò-cua-toi")).toThrow(
      /^trò-cua-toi: /,
    );
  });
});

describe("assertCountBounds — luat chung", () => {
  it("khong co telemetry thi khong bao loi", () => {
    expect(() => assertCountBounds("schulte", null)).not.toThrow();
    expect(() => assertCountBounds("schulte", undefined)).not.toThrow();
    expect(() => assertCountBounds("schulte", {})).not.toThrow();
  });

  it("khong dem nao duoc am", () => {
    const truong = [
      "wrongClicks",
      "mistakes",
      "correct",
      "wrong",
      "hits",
      "misses",
      "falseAlarms",
      "falseStarts",
      "totalStimuli",
      "trials",
      "targets",
      "maxLevel",
      "goTrials",
      "nogoTrials",
      "correctRejections",
      "span",
      "correctTrials",
      "taps",
      "nodes",
    ];
    for (const k of truong) {
      expect(() => assertCountBounds("schulte", { [k]: -1 }), k).toThrow(
        `schulte: ${k} cannot be negative`,
      );
    }
  });

  it("bo qua truong khong phai so thay vi bao loi", () => {
    expect(() =>
      assertCountBounds("schulte", { wrongClicks: "nhieu" }),
    ).not.toThrow();
    expect(() =>
      assertCountBounds("schulte", { wrongClicks: NaN }),
    ).not.toThrow();
  });
});

describe("assertCountBounds — nback", () => {
  it("muc tieu khong the nhieu hon so luot", () => {
    expect(() =>
      assertCountBounds("nback", { trials: 20, targets: 21 }),
    ).toThrow("nback: targets exceed trials");
  });

  it("bat dung khong the nhieu hon muc tieu", () => {
    expect(() => assertCountBounds("nback", { targets: 6, hits: 7 })).toThrow(
      "nback: hits exceed targets",
    );
  });

  it("bam nham khong the nhieu hon so luot", () => {
    expect(() =>
      assertCountBounds("nback", { trials: 20, falseAlarms: 21 }),
    ).toThrow("nback: false alarms exceed trials");
  });

  it("so do tre khong the nhieu hon so luot", () => {
    expect(() =>
      assertCountBounds("nback", { trials: 2, rts: [100, 100, 100] }),
    ).toThrow("nback: more reaction times than trials");
  });

  it("van hop le thi im lang", () => {
    expect(() =>
      assertCountBounds("nback", {
        trials: 20,
        targets: 6,
        hits: 5,
        misses: 1,
        falseAlarms: 2,
        rts: [400, 380, 420, 500, 350],
      }),
    ).not.toThrow();
  });
});

describe("assertCountBounds — gonogo", () => {
  it("go + nogo phai dung bang tong so luot", () => {
    expect(() =>
      assertCountBounds("gonogo", { trials: 40, goTrials: 30, nogoTrials: 9 }),
    ).toThrow("gonogo: go+nogo must equal trials");
    expect(() =>
      assertCountBounds("gonogo", { trials: 40, goTrials: 30, nogoTrials: 10 }),
    ).not.toThrow();
  });

  it("bat dung khong vuot so luot GO", () => {
    expect(() =>
      assertCountBounds("gonogo", { goTrials: 30, hits: 31 }),
    ).toThrow("gonogo: hits exceed go trials");
  });

  it("bam nham khong vuot so luot NOGO", () => {
    expect(() =>
      assertCountBounds("gonogo", { nogoTrials: 10, falseAlarms: 11 }),
    ).toThrow("gonogo: false alarms exceed nogo trials");
  });

  it("chi luot GO moi sinh ra do tre", () => {
    expect(() =>
      assertCountBounds("gonogo", { goTrials: 2, rts: [300, 300, 300] }),
    ).toThrow("gonogo: more reaction times than go trials");
  });
});

describe("assertCountBounds — mental / math / stroop", () => {
  it("mental: dung + sai phai bang tong luot", () => {
    expect(() =>
      assertCountBounds("mental", { trials: 20, correct: 15, wrong: 4 }),
    ).toThrow("mental: correct+wrong must equal trials");
    expect(() =>
      assertCountBounds("mental", { trials: 20, correct: 15, wrong: 5 }),
    ).not.toThrow();
  });

  it("mental: khong nhieu do tre hon so luot", () => {
    expect(() =>
      assertCountBounds("mental", { trials: 1, rts: [1, 2] }),
    ).toThrow("mental: more reaction times than trials");
  });

  it("math: khong the tra loi nhieu hon so cau da ra", () => {
    expect(() =>
      assertCountBounds("math", { total: 20, correct: 18, wrong: 5 }),
    ).toThrow("math: answered more problems than served");
  });

  it("math: khong nhieu do tre hon so cau", () => {
    expect(() =>
      assertCountBounds("math", { total: 2, rts: [1, 2, 3] }),
    ).toThrow("math: more reaction times than problems");
  });

  it("stroop: bam sai khong the nhieu hon so kich thich", () => {
    expect(() =>
      assertCountBounds("stroop", { totalStimuli: 30, wrongClicks: 31 }),
    ).toThrow("stroop: wrong clicks exceed stimuli shown");
  });

  it("stroop: khong nhieu do tre hon so kich thich", () => {
    expect(() =>
      assertCountBounds("stroop", { totalStimuli: 2, rts: [1, 2, 3] }),
    ).toThrow("stroop: more reaction times than stimuli");
  });
});

describe("assertCountBounds — corsi", () => {
  it("chuoi dung khong vuot tong so chuoi", () => {
    expect(() =>
      assertCountBounds("corsi", { trials: 5, correctTrials: 6 }),
    ).toThrow("corsi: correct trials exceed trials");
  });

  it("moi chuoi chi hong duoc mot lan", () => {
    expect(() =>
      assertCountBounds("corsi", { trials: 5, wrongClicks: 6 }),
    ).toThrow("corsi: wrong clicks exceed trials");
  });

  it("chuoi khong the dai hon luoi 3x3", () => {
    expect(() => assertCountBounds("corsi", { span: 10, taps: 50 })).toThrow(
      "corsi: span exceeds grid size",
    );
    expect(() =>
      assertCountBounds("corsi", { span: 9, taps: 50 }),
    ).not.toThrow();
  });

  it("khong the nho chuoi dai hon so lan cham", () => {
    expect(() => assertCountBounds("corsi", { span: 7, taps: 6 })).toThrow(
      "corsi: fewer taps than the reported span",
    );
  });

  it("khong nhieu do tre hon so lan cham", () => {
    expect(() =>
      assertCountBounds("corsi", { taps: 2, rts: [100, 100, 100] }),
    ).toThrow("corsi: more reaction times than taps");
  });
});

describe("assertCountBounds — trail", () => {
  it("che do chi duoc la A hoac B", () => {
    expect(() => assertCountBounds("trail", { mode: "C", nodes: 10 })).toThrow(
      "trail: mode must be A or B",
    );
    expect(() =>
      assertCountBounds("trail", { mode: "A", nodes: 10 }),
    ).not.toThrow();
    expect(() =>
      assertCountBounds("trail", { mode: "B", nodes: 10 }),
    ).not.toThrow();
    expect(() => assertCountBounds("trail", { nodes: 10 })).not.toThrow();
  });

  it("can it nhat 2 diem moi thanh duong", () => {
    expect(() => assertCountBounds("trail", { nodes: 1 })).toThrow(
      "trail: too few nodes",
    );
    expect(() => assertCountBounds("trail", { nodes: 2 })).not.toThrow();
  });

  it("khong nhieu do tre hon so diem", () => {
    expect(() =>
      assertCountBounds("trail", { nodes: 2, rts: [1, 2, 3] }),
    ).toThrow("trail: more reaction times than nodes");
  });

  it("chan so lan bam nham vo ly", () => {
    expect(() =>
      assertCountBounds("trail", { nodes: 10, wrongClicks: 401 }),
    ).toThrow("trail: implausible number of wrong clicks");
    expect(() =>
      assertCountBounds("trail", { nodes: 10, wrongClicks: 400 }),
    ).not.toThrow();
  });
});

describe("khong ap luat cua tro nay sang tro khac", () => {
  it("luat gonogo khong dung cho schulte", () => {
    // Neu ai do bo nham dieu kien ra ngoai khoi if(game === ...) thi test do.
    expect(() =>
      assertCountBounds("schulte", { trials: 40, goTrials: 30, nogoTrials: 9 }),
    ).not.toThrow();
  });

  it("luat corsi khong dung cho memory", () => {
    expect(() =>
      assertCountBounds("memory", { span: 99, taps: 1 }),
    ).not.toThrow();
  });
});
