/**
 * Observability phia server (Edge Function) — thuan, khong phu thuoc Deno API.
 *
 * Truoc day toan bo chan doan la `console.log("Submit round error: " + err)`:
 * khong request id, khong thoi gian xu ly, khong ai dem duoc ty le 4xx/5xx, va
 * moi thu bien mat sau 24 gio trong log Supabase. Module nay:
 *
 *  1. In log MOT DONG JSON (structured) de loc/dem duoc ngay tren dashboard.
 *  2. Gan request id cho tung request, tra ve header `x-request-id` de nguoi
 *     dung bao loi kem ma tra cuu.
 *  3. Ghi cac su kien warn/error vao bang `observability_events` qua mot sink
 *     duoc index.ts nap vao (module nay khong biet gi ve supabase-js).
 *  4. Lam sach + kep gioi han telemetry gui tu trinh duyet (ham thuan
 *     `sanitizeClientEvents`, co unit test).
 */

export type Severity = "debug" | "info" | "warn" | "error" | "fatal";

export const SEVERITIES: readonly Severity[] = [
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

export type ObservabilityRow = {
  source: "client" | "server";
  level: Severity;
  event: string;
  message: string | null;
  route: string | null;
  game: string | null;
  release: string | null;
  session_id: string | null;
  user_id: string | null;
  request_id: string | null;
  duration_ms: number | null;
  status_code: number | null;
  fingerprint: string;
  count: number;
  context: Record<string, unknown>;
};

export const MAX_EVENTS_PER_BATCH = 20;
export const MAX_TEXT_LEN = 300;
export const MAX_CONTEXT_KEYS = 20;

const REDACTIONS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[jwt]"],
  [
    /(apikey|api_key|access_token|refresh_token|token|secret|password|authorization)(\s*[:=]\s*)[^\s,;"'}]+/gi,
    "$1$2[redacted]",
  ],
  [/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, "[email]"],
  [/\b\d{9,}\b/g, "[num]"],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[uuid]"],
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scrubText(
  input: unknown,
  maxLen = MAX_TEXT_LEN,
): string | null {
  if (input == null) return null;
  let text = typeof input === "string" ? input : String(input);
  for (const [pattern, replacement] of REDACTIONS)
    text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}\u2026` : text;
}

export function fingerprintOf(parts: Array<string | null | undefined>): string {
  const input = parts.filter(Boolean).join("|").replace(/\d+/g, "#");
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1)
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

function intOrNull(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function scrubContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value).slice(0, MAX_CONTEXT_KEYS)) {
    const safeKey = key.slice(0, 40);
    if (typeof raw === "number" && Number.isFinite(raw)) out[safeKey] = raw;
    else if (typeof raw === "boolean" || raw === null) out[safeKey] = raw;
    else if (
      safeKey === "request_id" ||
      safeKey === "session_id" ||
      safeKey === "round_id" ||
      safeKey === "client_round_id" ||
      safeKey === "trace_id"
    ) {
      // Whitelist these keys to prevent UUID redaction
      out[safeKey] = typeof raw === "string" ? raw : String(raw);
    }
    else out[safeKey] = scrubText(raw);
  }
  return out;
}

function asSeverity(value: unknown): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : "info";
}

/**
 * Bien payload tu trinh duyet (KHONG DUOC TIN) thanh cac dong hop le.
 * Tra ve [] neu payload sai dinh dang — khong bao gio nem loi.
 */
export function sanitizeClientEvents(
  payload: unknown,
  meta: { userId?: string | null; requestId?: string | null } = {},
): ObservabilityRow[] {
  const events = (payload as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];

  const userId =
    typeof meta.userId === "string" && UUID_RE.test(meta.userId)
      ? meta.userId
      : null;
  const requestId = scrubText(meta.requestId, 64);

  const rows: ObservabilityRow[] = [];
  for (const raw of events.slice(0, MAX_EVENTS_PER_BATCH)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const event = scrubText(e.event, 80);
    if (!event) continue;

    const level = asSeverity(e.level);
    const message = scrubText(e.message);
    const route = scrubText(e.route, 120);
    const fingerprint =
      scrubText(e.fingerprint, 32) ??
      fingerprintOf([event, level, message, route]);

    rows.push({
      source: "client",
      level,
      event,
      message,
      route,
      game: scrubText(e.game, 20),
      release: scrubText(e.release, 40),
      session_id: scrubText(e.sessionId, 64),
      user_id:
        userId ??
        (typeof e.userId === "string" && UUID_RE.test(e.userId)
          ? e.userId
          : null),
      request_id: requestId,
      duration_ms: intOrNull(e.durationMs, 0, 3_600_000),
      status_code: intOrNull(e.statusCode, 100, 599),
      fingerprint,
      count: intOrNull(e.count, 1, 1000) ?? 1,
      context: scrubContext(e.context),
    });
  }
  return rows;
}

// ─── Sink (index.ts nap vao) ──────────────────────────────────────────────

export type EventSink = (rows: ObservabilityRow[]) => void;
export type MetricSink = (path: string, status: number, latency: number) => void;

let sink: EventSink | null = null;
let metricSink: MetricSink | null = null;

export function setEventSink(next: EventSink | null): void {
  sink = next;
}
export function setMetricSink(next: MetricSink | null): void {
  metricSink = next;
}

export function persistEvents(rows: ObservabilityRow[]): void {
  if (!sink || rows.length === 0) return;
  try {
    sink(rows);
  } catch {
    // Ghi log khong bao gio duoc lam vo request.
  }
}

export function recordHttpMetric(path: string, status: number, latency: number): void {
  if (!metricSink) return;
  try {
    metricSink(path, status, latency);
  } catch {}
}

// ─── Request id + log mot dong JSON ─────────────────────────────────────

const REQUEST_IDS = new WeakMap<Request, string>();

export function newRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Gan (hoac lay lai) request id. Uu tien header cua CDN de trace xuyen tang. */
export function beginRequest(req: Request): string {
  const existing = REQUEST_IDS.get(req);
  if (existing) return existing;
  const inbound =
    req.headers.get("x-request-id") ?? req.headers.get("cf-ray") ?? null;
  const id = (inbound && scrubText(inbound, 64)) || newRequestId();
  REQUEST_IDS.set(req, id);
  return id;
}

export function requestIdFor(req: Request): string | null {
  return REQUEST_IDS.get(req) ?? null;
}

function emit(line: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify(line));
  } catch {
    console.log(String(line.event ?? "log"));
  }
}

export type RequestLog = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string | null;
};

/** Goi o middleware sau khi handler chay xong. */
export function logRequest(entry: RequestLog): void {
  const level: Severity =
    entry.status >= 500 ? "error" : entry.status >= 400 ? "warn" : "info";
  emit({
    ts: new Date().toISOString(),
    level,
    event: "http.request",
    requestId: entry.requestId,
    method: entry.method,
    path: entry.path,
    status_code: entry.status,
    duration_ms: Math.round(entry.durationMs),
  });

  // Ghi nhan metric de theo doi SLO (tong hop theo phut tren Postgres)
  recordHttpMetric(entry.path, entry.status, Math.round(entry.durationMs));

  // Chi luu ben vung nhung gi dang xem lai: loi server va 4xx bat thuong.
  // GIO DA CO metrics minute, khong can luu HTTP 200 submit-round nua
  // (tranh lam phinh bang observability_events chi de lay mau so).
  if (
    entry.status >= 500 || 
    entry.status === 429 || 
    entry.status === 422
  ) {
    persistEvents([
      {
        source: "server",
        level,
        event: "http.request",
        message: `${entry.method} ${entry.path} -> ${entry.status}`,
        route: scrubText(entry.path, 120),
        game: null,
        release: null,
        session_id: null,
        user_id: entry.userId ?? null,
        request_id: entry.requestId,
        duration_ms: Math.round(entry.durationMs),
        status_code: entry.status,
        fingerprint: fingerprintOf([
          "http.request",
          entry.method,
          entry.path,
          String(entry.status),
        ]),
        count: 1,
        context: {},
      },
    ]);
  }
}

export type ServerEventInput = {
  event: string;
  level?: Severity;
  message?: unknown;
  route?: string | null;
  game?: string | null;
  userId?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  statusCode?: number | null;
  context?: Record<string, unknown>;
  /** false = chi in log, khong ghi DB. Mac dinh: ghi DB tu muc warn tro len. */
  persist?: boolean;
};

/** Ghi mot su kien nghiep vu (anticheat, rate limit, RPC that bai…). */
export function logServerEvent(input: ServerEventInput): void {
  const level = input.level ?? "info";
  const message = scrubText(input.message);
  const route = scrubText(input.route, 120);
  emit({
    ts: new Date().toISOString(),
    level,
    event: input.event,
    requestId: input.requestId ?? null,
    route,
    game: input.game ?? null,
    message,
    duration_ms: input.durationMs ?? null,
    status_code: input.statusCode ?? null,
    ...(input.context ?? {}),
  });

  const shouldPersist =
    input.persist ??
    (level === "warn" || level === "error" || level === "fatal");
  if (!shouldPersist) return;

  persistEvents([
    {
      source: "server",
      level,
      event: scrubText(input.event, 80) ?? "server.event",
      message,
      route,
      game: scrubText(input.game, 20),
      release: null,
      session_id: null,
      user_id:
        typeof input.userId === "string" && UUID_RE.test(input.userId)
          ? input.userId
          : null,
      request_id: scrubText(input.requestId, 64),
      duration_ms: intOrNull(input.durationMs, 0, 3_600_000),
      status_code: intOrNull(input.statusCode, 100, 599),
      fingerprint: fingerprintOf([input.event, level, message, route]),
      count: 1,
      context: scrubContext(input.context),
    },
  ]);
}

// ─── Chan spam telemetry (trong bo nho cua isolate) ─────────────────────────

export type RateLimiter = {
  allow(key: string): boolean;
  size(): number;
};

/**
 * Cua so truot don gian, khong can DB. Du cho endpoint telemetry: muc tieu chi
 * la chan mot tab dien gui hang nghin su kien, khong phai chong tan cong phan
 * tan (viec do la cua rate limit theo IP o tang tren + gioi han kich thuoc body).
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, now = () => Date.now(), maxKeys = 5_000 } = options;
  const hits = new Map<string, number[]>();

  return {
    allow(key: string): boolean {
      const at = now();
      const cutoff = at - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(at);
      hits.set(key, recent);
      // Chan phinh bo nho neu bi nhieu key rac.
      if (hits.size > maxKeys) {
        for (const [k, stamps] of hits) {
          if (stamps.every((t) => t <= cutoff)) hits.delete(k);
          if (hits.size <= maxKeys) break;
        }
      }
      return true;
    },
    size: () => hits.size,
  };
}
