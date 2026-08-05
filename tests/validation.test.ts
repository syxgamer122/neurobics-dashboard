// Xac thuc bien telemetry o phia server.
//
// Day la hang rao chan du lieu vo ly TRUOC khi cham diem: neu no bi noi long,
// mot request tu tao co the ghi ky luc khong the co that. Moi thong diep loi
// duoi day duoc doi chieu voi ma nguon that, khong phai doan.
import { describe, expect, it } from "vitest";
import type { Game } from "../supabase/functions/_shared/scoring/core";
import {
  assertCountBounds,
  assertRtBounds,
} from "../supabase/functions/_shared/scoring/validation";

const filled = (n: number, value: number): number[] =>
  Array.from({ length: n }, () => value);

describe("assertRtBounds", () => {
  it("thieu du lieu thi bo qua, khong nem loi", () => {
    expect(() => assertRtBounds(null, 60_000, "reaction")).not.toThrow();
    expect(() => assertRtBounds(undefined, 60_000, "reaction")).not.toThrow();
    expect(() => assertRtBounds([], 60_000, "reaction")).not.toThrow();
  });

  it("tu choi thu khong phai mang", () => {
    expect(() => assertRtBounds("123", 60_000, "reaction")).toThrow(
      "reaction: rts must be an array",
    );
  });

  it("nhan du lieu hop le", () => {
    expect(() =>
      assertRtBounds([300, 310, 320, 330, 340], 60_000, "reaction"),
    ).not.toThrow();
  });

  it("san cung 80ms: nhan 80, tu choi 79", () => {
    expect(() => assertRtBounds([80], 60_000, "reaction")).not.toThrow();
    expect(() => assertRtBounds([79], 60_000, "reaction")).toThrow(
      "reaction: reaction time below human threshold",
    );
  });

  it("tran 60000ms: nhan 60000, tu choi 60001", () => {
    expect(() => assertRtBounds([60_000], 999_999, "reaction")).not.toThrow();
    expect(() => assertRtBounds([60_001], 999_999, "reaction")).toThrow(
      "reaction: reaction time out of range",
    );
  });

  it("tu choi gia tri khong phai so", () => {
    expect(() => assertRtBounds([Number.NaN], 60_000, "reaction")).toThrow(
      "reaction: reaction time is not a number",
    );
    expect(() => assertRtBounds(["300"], 60_000, "reaction")).toThrow(
      "reaction: reaction time is not a number",
    );
    expect(() =>
      assertRtBounds([Number.POSITIVE_INFINITY], 60_000, "reaction"),
    ).toThrow("reaction: reaction time is not a number");
  });

  it("gioi han 5000 mau: nhan 5000, tu choi 5001", () => {
    expect(() => assertRtBounds(filled(5000, 100), 9_999_999, "x")).not.toThrow();
    expect(() => assertRtBounds(filled(5001, 100), 9_999_999, "x")).toThrow(
      "x: too many reaction times",
    );
  });

  // Chan kieu gian lan "gui 10 lan phan ung 2 giay trong mot van dai 1 giay".
  it("tong thoi gian phan ung khong duoc vuot thoi luong van (bien 15s)", () => {
    expect(() => assertRtBounds(filled(10, 2000), 1000, "reaction")).toThrow(
      "reaction: sum of reaction times exceeds round duration",
    );
    // Dung bang bien 15s thi van nhan.
    expect(() =>
      assertRtBounds([5000, 5000, 5000], 0, "reaction"),
    ).not.toThrow();
    // Hon bien 1ms thi tu choi.
    expect(() => assertRtBounds([5001, 5000, 5000], 0, "reaction")).toThrow(
      "reaction: sum of reaction times exceeds round duration",
    );
  });

  it("nhan dung ten game trong thong diep loi", () => {
    expect(() => assertRtBounds([1], 60_000, "stroop")).toThrow(/^stroop:/);
  });
});

describe("assertCountBounds", () => {
  const GAMES: Game[] = [
    "schulte",
    "nback",
    "math",
    "stroop",
    "gonogo",
    "mental",
    "corsi",
    "trail",
  ];

  it("telemetry rong thi khong game nao bi tu choi", () => {
    for (const game of GAMES) {
      expect(() => assertCountBounds(game, {})).not.toThrow();
    }
  });

  it("moi so dem am deu bi tu choi", () => {
    expect(() => assertCountBounds("schulte", { wrongClicks: -1 })).toThrow(
      "schulte: wrongClicks cannot be negative",
    );
    expect(() => assertCountBounds("trail", { nodes: -5 })).toThrow(
      "trail: nodes cannot be negative",
    );
  });

  it("nback: cac so dem phai nhat quan voi nhau", () => {
    expect(() => assertCountBounds("nback", { trials: 10, targets: 11 })).toThrow(
      "nback: targets exceed trials",
    );
    expect(() =>
      assertCountBounds("nback", { trials: 20, targets: 5, hits: 6 }),
    ).toThrow("nback: hits exceed targets");
    expect(() =>
      assertCountBounds("nback", { trials: 10, falseAlarms: 11 }),
    ).toThrow("nback: false alarms exceed trials");
    expect(() =>
      assertCountBounds("nback", { trials: 2, rts: [100, 200, 300] }),
    ).toThrow("nback: more reaction times than trials");
    expect(() =>
      assertCountBounds("nback", {
        trials: 20,
        targets: 6,
        hits: 5,
        falseAlarms: 1,
        rts: [200, 300],
      }),
    ).not.toThrow();
  });

  it("math: khong the tra loi nhieu hon so bai duoc phat", () => {
    expect(() =>
      assertCountBounds("math", { correct: 8, wrong: 5, total: 10 }),
    ).toThrow("math: answered more problems than served");
    expect(() =>
      assertCountBounds("math", { total: 2, rts: [100, 200, 300] }),
    ).toThrow("math: more reaction times than problems");
  });

  it("stroop: so lan sai va so mau phan ung khong vuot so kich thich", () => {
    expect(() =>
      assertCountBounds("stroop", { totalStimuli: 10, wrongClicks: 11 }),
    ).toThrow("stroop: wrong clicks exceed stimuli shown");
    expect(() =>
      assertCountBounds("stroop", { totalStimuli: 1, rts: [100, 200] }),
    ).toThrow("stroop: more reaction times than stimuli");
  });

  it("gonogo: go + nogo phai bang tong so luot", () => {
    expect(() =>
      assertCountBounds("gonogo", { trials: 100, goTrials: 70, nogoTrials: 20 }),
    ).toThrow("gonogo: go+nogo must equal trials");
    expect(() =>
      assertCountBounds("gonogo", {
        trials: 100,
        goTrials: 80,
        nogoTrials: 20,
        hits: 75,
        falseAlarms: 3,
      }),
    ).not.toThrow();
    expect(() =>
      assertCountBounds("gonogo", { goTrials: 10, hits: 11 }),
    ).toThrow("gonogo: hits exceed go trials");
    expect(() =>
      assertCountBounds("gonogo", { nogoTrials: 5, falseAlarms: 6 }),
    ).toThrow("gonogo: false alarms exceed nogo trials");
  });

  it("mental: dung + sai phai bang tong so luot", () => {
    expect(() =>
      assertCountBounds("mental", { trials: 10, correct: 5, wrong: 4 }),
    ).toThrow("mental: correct+wrong must equal trials");
    expect(() =>
      assertCountBounds("mental", { trials: 10, correct: 6, wrong: 4 }),
    ).not.toThrow();
  });

  it("corsi: chuoi khong vuot luoi 3x3 va phai co du cu cham", () => {
    expect(() => assertCountBounds("corsi", { span: 10 })).toThrow(
      "corsi: span exceeds grid size",
    );
    expect(() => assertCountBounds("corsi", { span: 5, taps: 4 })).toThrow(
      "corsi: fewer taps than the reported span",
    );
    expect(() =>
      assertCountBounds("corsi", { trials: 3, correctTrials: 4 }),
    ).toThrow("corsi: correct trials exceed trials");
    expect(() =>
      assertCountBounds("corsi", {
        trials: 5,
        correctTrials: 4,
        span: 5,
        taps: 15,
        wrongClicks: 1,
      }),
    ).not.toThrow();
  });

  it("trail: chi co che do A/B va toi thieu 2 diem", () => {
    expect(() => assertCountBounds("trail", { mode: "C", nodes: 25 })).toThrow(
      "trail: mode must be A or B",
    );
    expect(() =>
      assertCountBounds("trail", { mode: "B", nodes: 25 }),
    ).not.toThrow();
    expect(() => assertCountBounds("trail", { nodes: 1 })).toThrow(
      "trail: too few nodes",
    );
    expect(() =>
      assertCountBounds("trail", { nodes: 2, rts: [100, 200, 300] }),
    ).toThrow("trail: more reaction times than nodes");
    expect(() =>
      assertCountBounds("trail", { nodes: 5, wrongClicks: 201 }),
    ).toThrow("trail: implausible number of wrong clicks");
  });
});
