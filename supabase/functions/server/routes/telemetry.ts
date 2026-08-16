import type { Hono } from "npm:hono@4.12.27";
import {
  beginRequest,
  requestIdFor,
  sanitizeClientEvents,
} from "../../_shared/observability.ts";
import { adminClient } from "../config.ts";
import { consumeRateLimit } from "../security.ts";

export function registerTelemetryRoutes(app: Hono): void {
  // ─── Telemetry ingest ───────────────────────────────────────────────────
  // Trinh duyet gui loi/su kien da lam sach ve day. Khong can dang nhap: loi hay
  // xay ra TRUOC khi co session (man hinh trang, bundle cu, mang chet).
  // Ba lop chan lam dung: gioi han 60 lo/phut/IP, body <= 32KB, <= 20 su kien/lo.

  app.post("/server/telemetry", async (c) => {
    const requestId = requestIdFor(c.req.raw) ?? beginRequest(c.req.raw);
    const ip =
      (c.req.header("x-forwarded-for") ?? "unknown").split(",")[0]?.trim() ??
      "unknown";
      
    try {
      const allowed = await consumeRateLimit(`telemetry:${ip}`, 60, 60);
      if (!allowed) {
        // Im lang bo qua thay vi 429: telemetry khong duoc lam on phia client.
        return c.json({ ok: true, dropped: true }, 202);
      }
    } catch {
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

    let userId: string | null = null;
    try {
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { data: authData } = await adminClient.auth.getUser(token);
        if (authData?.user) {
          userId = authData.user.id;
        }
      }
    } catch {
      // Ignore auth errors for telemetry
    }

    const rows = sanitizeClientEvents(payload, { requestId }).map((row) => ({
      ...row,
      user_id: userId,
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
