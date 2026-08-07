import type { Hono } from "npm:hono@4.12.27";
import { cors } from "npm:hono@4.12.27/cors";
import {
  beginRequest,
  logRequest,
  logServerEvent,
  requestIdFor,
} from "../_shared/observability.ts";
import { ALLOWED_ORIGINS } from "./cors.ts";

export function configureMiddleware(app: Hono): void {
  // Observability: moi request co request id + mot dong log JSON (method, path,
  // status, thoi gian xu ly). Thay cho hono logger() vi log dang van ban khong
  // loc/dem duoc tren dashboard. 5xx/429/422 con duoc ghi vao observability_events.
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    const requestId = beginRequest(c.req.raw);
    try {
      await next();
    } finally {
      c.header("x-request-id", requestId);
      logRequest({
        requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  // Loi khong duoc bat o handler: tra 500 co request id thay vi stack tran ra.
  app.onError((err, c) => {
    const requestId = requestIdFor(c.req.raw) ?? beginRequest(c.req.raw);
    logServerEvent({
      event: "http.unhandled_error",
      level: "error",
      message:
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      route: new URL(c.req.url).pathname,
      requestId,
      statusCode: 500,
    });
    return c.json({ error: "Internal error", requestId }, 500);
  });

  app.use(
    "/*",
    cors({
      origin: ALLOWED_ORIGINS,
      // `apikey` va `x-client-info` duoc liet ke de phong client gui kem (thu vien
      // supabase-js tu dong them chung). Thieu mot header trong danh sach nay thi
      // preflight OPTIONS bi tu choi va request that bai TRUOC KHI toi handler,
      // nen loi hien ra la "CORS policy" chu khong phai loi that su.
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "apikey",
        "x-client-info",
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
    }),
  );
}
