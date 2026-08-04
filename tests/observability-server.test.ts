import { describe, expect, it } from "vitest";
import {
  MAX_EVENTS_PER_BATCH,
  createRateLimiter,
  fingerprintOf,
  sanitizeClientEvents,
  scrubText,
} from "../supabase/functions/_shared/observability";

/**
 * Endpoint /server/telemetry nhan du lieu tu TRINH DUYET — tuc la du lieu do
 * nguoi la gui. Ham sanitizeClientEvents la hang rao duy nhat truoc khi ghi vao
 * database, nen no phai duoc test ky nhu tang xac thuc telemetry cua game.
 */
describe("sanitizeClientEvents — hang rao dau vao", () => {
  it("tu choi payload sai dinh dang ma khong nem loi", () => {
    for (const bad of [null, undefined, 42, "events", {}, { events: {} }, []]) {
      expect(sanitizeClientEvents(bad)).toEqual([]);
    }
  });

  it("bo su kien khong co ten", () => {
    const rows = sanitizeClientEvents({
      events: [{ level: "error" }, { event: "   " }, { event: "ok.event" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe("ok.event");
  });

  it(`chi nhan toi da ${MAX_EVENTS_PER_BATCH} su kien moi lo`, () => {
    const events = Array.from({ length: 500 }, (_, i) => ({ event: `e${i}` }));
    expect(sanitizeClientEvents({ events })).toHaveLength(MAX_EVENTS_PER_BATCH);
  });

  it("ep muc do la gia tri hop le (khong cho ghi rac vao cot level)", () => {
    const rows = sanitizeClientEvents({
      events: [
        { event: "a", level: "error" },
        { event: "b", level: "CRITICAL" },
        { event: "c", level: 12 },
      ],
    });
    expect(rows.map((r) => r.level)).toEqual(["error", "info", "info"]);
    expect(rows.every((r) => r.source === "client")).toBe(true);
  });

  it("cat ngan moi truong text theo gioi han cot", () => {
    const [row] = sanitizeClientEvents({
      events: [
        {
          event: "x".repeat(500),
          message: "y".repeat(5_000),
          route: "/z".repeat(500),
          game: "g".repeat(100),
          release: "r".repeat(100),
          sessionId: "s".repeat(500),
        },
      ],
    });
    expect(row.event.length).toBeLessThanOrEqual(80);
    expect(row.message!.length).toBeLessThanOrEqual(300);
    expect(row.route!.length).toBeLessThanOrEqual(120);
    expect(row.game!.length).toBeLessThanOrEqual(20);
    expect(row.release!.length).toBeLessThanOrEqual(40);
    expect(row.session_id!.length).toBeLessThanOrEqual(64);
  });

  it("loai so ngoai khoang va gia tri khong phai so", () => {
    const [row] = sanitizeClientEvents({
      events: [
        {
          event: "e",
          durationMs: -5,
          statusCode: 999,
          count: 10_000,
        },
      ],
    });
    expect(row.duration_ms).toBeNull();
    expect(row.status_code).toBeNull();
    expect(row.count).toBe(1);

    const [ok] = sanitizeClientEvents({
      events: [{ event: "e", durationMs: 1234.6, statusCode: 503, count: 7 }],
    });
    expect(ok.duration_ms).toBe(1235);
    expect(ok.status_code).toBe(503);
    expect(ok.count).toBe(7);
  });

  it("chi nhan user_id la UUID that", () => {
    const uuid = "3afd872b-594c-4186-8ce2-00028d39b2c4";
    expect(
      sanitizeClientEvents({ events: [{ event: "e" }] }, { userId: uuid })[0]
        .user_id,
    ).toBe(uuid);
    expect(
      sanitizeClientEvents(
        { events: [{ event: "e" }] },
        { userId: "admin' or 1=1" },
      )[0].user_id,
    ).toBeNull();
  });

  it("lam sach bi mat trong message va context", () => {
    const [row] = sanitizeClientEvents({
      events: [
        {
          event: "api.fail",
          message: "token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefgh loi",
          context: { email: "studentcow05@gmail.com", tries: 3, ok: false },
        },
      ],
    });
    expect(row.message).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(String(row.context.email)).toBe("[email]");
    expect(row.context.tries).toBe(3);
    expect(row.context.ok).toBe(false);
  });

  it("luon co fingerprint de nhom loi, ke ca khi client khong gui", () => {
    const [a] = sanitizeClientEvents({
      events: [{ event: "e", message: "timeout after 1200ms" }],
    });
    const [b] = sanitizeClientEvents({
      events: [{ event: "e", message: "timeout after 9900ms" }],
    });
    expect(a.fingerprint).toBeTruthy();
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("context khong phai object thi thanh {} (khong lam vo cot jsonb)", () => {
    for (const bad of [null, "str", 5, [1, 2]]) {
      const [row] = sanitizeClientEvents({
        events: [{ event: "e", context: bad }],
      });
      expect(row.context).toEqual({});
    }
  });
});

describe("scrubText / fingerprintOf (server)", () => {
  it("tra null cho gia tri rong", () => {
    expect(scrubText(null)).toBeNull();
    expect(scrubText("   ")).toBeNull();
    expect(scrubText(undefined)).toBeNull();
  });

  it("van tay on dinh va bo qua chu so", () => {
    expect(fingerprintOf(["http.request", "GET", "/round/1"])).toBe(
      fingerprintOf(["http.request", "GET", "/round/2"]),
    );
    expect(fingerprintOf(["a"])).not.toBe(fingerprintOf(["b"]));
    expect(fingerprintOf([null, undefined, "a"])).toBe(fingerprintOf(["a"]));
  });
});

describe("createRateLimiter — chan spam telemetry", () => {
  it("cho qua den han roi chan", () => {
    let clock = 0;
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 1_000,
      now: () => clock,
    });
    expect(limiter.allow("ip-1")).toBe(true);
    expect(limiter.allow("ip-1")).toBe(true);
    expect(limiter.allow("ip-1")).toBe(true);
    expect(limiter.allow("ip-1")).toBe(false);
    // Key khac khong bi anh huong.
    expect(limiter.allow("ip-2")).toBe(true);
    // Sau khi cua so truot qua, duoc phep tiep.
    clock = 1_500;
    expect(limiter.allow("ip-1")).toBe(true);
  });

  it("khong phinh bo nho voi hang nghin key rac", () => {
    let clock = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => clock,
      maxKeys: 50,
    });
    for (let i = 0; i < 500; i += 1) {
      clock += 10;
      limiter.allow(`ip-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(500);
    expect(limiter.size()).toBeGreaterThan(0);
  });
});
