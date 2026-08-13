import type { Hono } from "npm:hono@4.12.27";
import {
  beginRequest,
  createRateLimiter,
  requestIdFor,
  sanitizeClientEvents,
} from "../../_shared/observability.ts";
import { adminClient } from "../config.ts";

export function registerTelemetryRoutes(app: Hono): void {
  // ─── Telemetry ingest ───────────────────────────────────────────────────
  // Trinh duyet gui loi/su kien da lam sach ve day. Khong can dang nhap: loi hay
  // xay ra TRUOC khi co session (man hinh trang, bundle cu, mang chet).
  // Ba lop chan lam dung: gioi han 60 lo/phut/IP, body <= 32KB, <= 20 su kien/lo.

  const telemetryLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

  app.post("/server/telemetry", async (c) => {
    const requestId = requestIdFor(c.req.raw) ?? beginRequest(c.req.raw);
    const ip =
      (c.req.header("x-forwarded-for") ?? "unknown").split(",")[0]?.trim() ??
      "unknown";
    if (!telemetryLimiter.allow(ip)) {
      // Im lang bo qua thay vi 429: telemetry khong duoc lam on phia client.
      return c.json({ ok: true, dropped: true }, 202);
    }

    const raw = await c.req.text();
    if (raw.length > 32_000) return c.json({ error: "Payload too large" }, 413);

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    // user_id luon null: client KHONG duoc tu khai danh tinh (de gia mao).
    // Muon quy trach nhiem thi dung session_id de nhom, hoac doi chieu voi
    // observability_events cua server o cung request_id.
    const rows = sanitizeClientEvents(payload, { requestId }).map((row) => ({
      ...row,
      user_id: null,
    }));
    if (rows.length === 0) return c.json({ ok: true, accepted: 0 });

    const { error } = await adminClient
      .from("observability_events")
      .insert(rows);
    if (error) {
      console.log(`telemetry insert failed: ${error.message}`);
      return c.json({ ok: false }, 200);
    }
    return c.json({ ok: true, accepted: rows.length });
  });
}
