import { describe, expect, it, vi } from "vitest";
import {
  MAX_BATCH,
  createCollector,
  fingerprintOf,
  normalizeForFingerprint,
  scrubContext,
  scrubText,
  type ObsPayloadEvent,
} from "../src/app/lib/observability";

function harness(overrides: Record<string, unknown> = {}) {
  const batches: ObsPayloadEvent[][] = [];
  const collector = createCollector({
    transport: (events) => batches.push(events),
    sessionId: "sess-1",
    release: "9.9.9",
    now: () => 1_000,
    ...overrides,
  });
  return { batches, collector };
}

describe("scrubText — khong bao gio de lo bi mat", () => {
  it("xoa JWT, token, mat khau, email va day so dai", () => {
    expect(
      scrubText(
        "failed with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
      ),
    ).toContain("[jwt]");
    expect(scrubText("apikey=abc123secretvalue")).toContain("[redacted]");
    expect(scrubText("password: hunter2hunter2")).toContain("[redacted]");
    expect(scrubText("user studentcow05@gmail.com bi loi")).toContain(
      "[email]",
    );
    expect(scrubText("card 4111111111111111")).toContain("[num]");
  });

  it("cat ngan de mot loi khong lam vo payload", () => {
    expect(scrubText("x".repeat(5_000)).length).toBeLessThanOrEqual(300);
    expect(scrubText("a".repeat(50), 10).length).toBeLessThanOrEqual(10);
  });

  it("chuan hoa khoang trang, tra chuoi rong cho gia tri rong", () => {
    expect(scrubText("  nhieu\n\n  khoang   trang ")).toBe(
      "nhieu khoang trang",
    );
    expect(scrubText(null)).toBe("");
    expect(scrubText(undefined)).toBe("");
  });
});

describe("fingerprint — gop loi giong nhau", () => {
  it("bo qua so lieu bien thien de cung mot loi co cung van tay", () => {
    expect(normalizeForFingerprint("timeout after 1234ms")).toBe(
      normalizeForFingerprint("timeout after 9876ms"),
    );
    expect(fingerprintOf(["a", "b"])).toBe(fingerprintOf(["a", "b"]));
    expect(fingerprintOf(["a", "b"])).not.toBe(fingerprintOf(["a", "c"]));
  });
});

describe("scrubContext — chan payload phinh to", () => {
  it("gioi han so khoa va do dai", () => {
    const huge: Record<string, unknown> = {};
    for (let i = 0; i < 100; i += 1) huge[`k${i}`] = "x".repeat(500);
    const safe = scrubContext(huge);
    expect(Object.keys(safe).length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(safe).length).toBeLessThan(4_000);
  });

  it("giu nguyen so va boolean, khong nem loi voi gia tri la", () => {
    const safe = scrubContext({ count: 3, ok: true, nested: { a: 1 } });
    expect(safe.count).toBe(3);
    expect(safe.ok).toBe(true);
    expect(scrubContext(undefined)).toEqual({});
  });
});

describe("collector", () => {
  it("gui su kien kem session, release va van tay", () => {
    const { batches, collector } = harness();
    collector.capture({
      event: "round.submit",
      level: "info",
      game: "schulte",
    });
    expect(collector.pending()).toBe(1);
    collector.flush();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0]).toMatchObject({
      event: "round.submit",
      level: "info",
      game: "schulte",
      sessionId: "sess-1",
      release: "9.9.9",
      count: 1,
    });
    expect(batches[0][0].fingerprint).toBeTruthy();
  });

  it("gop loi lap thay vi gui 100 lan giong nhau", () => {
    const { batches, collector } = harness();
    for (let i = 0; i < 100; i += 1) {
      collector.capture({
        event: "api.fail",
        level: "error",
        message: "timeout",
      });
    }
    expect(collector.pending()).toBe(1);
    collector.flush();
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].count).toBe(100);
  });

  it("tu dong gui khi day lo, khong giu qua MAX_BATCH", () => {
    const { batches, collector } = harness();
    for (let i = 0; i < MAX_BATCH; i += 1) {
      collector.capture({ event: `evt.${i}`, level: "error" });
    }
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(MAX_BATCH);
    expect(collector.pending()).toBe(0);
  });

  it("lay mau debug/info nhung KHONG bao gio bo loi", () => {
    const { batches, collector } = harness({
      sampleRate: 0.5,
      random: () => 0.9,
    });
    collector.capture({ event: "noise", level: "info" });
    collector.capture({ event: "noise.debug", level: "debug" });
    expect(collector.pending()).toBe(0);
    collector.capture({ event: "real.error", level: "error" });
    collector.capture({ event: "real.fatal", level: "fatal" });
    collector.capture({ event: "real.warn", level: "warn" });
    expect(collector.pending()).toBe(3);
    collector.flush();
    expect(batches[0].map((e) => e.event).sort()).toEqual([
      "real.error",
      "real.fatal",
      "real.warn",
    ]);
  });

  it("captureError lay ten + thong diep + stack da lam sach", () => {
    const { batches, collector } = harness();
    collector.setUser("11111111-1111-4111-8111-111111111111");
    collector.captureError(new TypeError("x is not a function"), {
      route: "/train/schulte",
    });
    collector.flush();
    const event = batches[0][0];
    expect(event.level).toBe("error");
    expect(event.message).toContain("is not a function");
    expect(event.route).toBe("/train/schulte");
    expect(event.userId).toBe("11111111-1111-4111-8111-111111111111");
    const ctx = event.context;
    expect(ctx).toBeDefined();
    // Gan ra bien cuc bo + optional chain: strictNullChecks khong hep kieu qua toBeDefined().
    expect(String(ctx?.stack ?? "")).not.toContain("\n");
  });

  it("loi cua transport khong duoc lam vo app", () => {
    const collector = createCollector({
      transport: () => {
        throw new Error("network down");
      },
      now: () => 1,
    });
    collector.capture({ event: "any", level: "error" });
    expect(() => collector.flush()).not.toThrow();
    expect(collector.pending()).toBe(0);
  });

  it("flush khi khong co gi thi khong goi transport", () => {
    const transport = vi.fn();
    createCollector({ transport, now: () => 1 }).flush();
    expect(transport).not.toHaveBeenCalled();
  });
});
