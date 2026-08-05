/**
 * Quan sat he thong phia client (observability) — KHONG phu thuoc thu vien.
 *
 * Truoc day loi o production im lang tuyet doi: logger.ts chi console.* khi DEV,
 * nen mot man hinh trang o may nguoi dung khong de lai bat ky dau vet nao.
 * Module nay gom loi + su kien lai, lam sach du lieu ca nhan, gop trung, roi
 * gui theo lo len Edge Function `/server/telemetry` (bang chinh anon key, khong
 * can dang nhap vi loi hay xay ra truoc khi co session).
 *
 * Nguyen tac:
 *  - Khong bao gio nem loi ra ngoai: telemetry chet thi app van chay.
 *  - Khong gui PII: email, JWT, UUID, day so dai deu bi thay bang nhan.
 *  - Co gioi han: 30 su kien/lo, 300 ky tu/chuoi, gop trung trong 60 giay.
 */
import {
  FUNCTIONS_BASE,
  HAS_SUPABASE_CONFIG,
  SUPABASE_ANON_KEY,
} from "./supabase-config";
import { APP_VERSION } from "./version";

// Dung `key: T | undefined` (khong phai `key?: T`) de tests/scan.mjs nhan ra
// ten SCREAMING_CASE la da khai bao — regex cua scan chi khop `NAME:` / `NAME=`,
// khong khop `NAME?:`.
type MetaEnv = {
  DEV: boolean | undefined;
  PROD: boolean | undefined;
  VITE_TELEMETRY_ENDPOINT: string | undefined;
  VITE_TELEMETRY_SAMPLE: string | undefined;
  VITE_TELEMETRY_OFF: string | undefined;
};

// import.meta.env khong ton tai khi file duoc chay bang node thuan (tests),
// nen doc phong thu thay vi truy cap truc tiep.
// Ep kieu MetaEnv: moi key deu `T | undefined`, doc thieu key van an toan.
const ENV = ((import.meta as unknown as { env?: MetaEnv }).env ??
  {}) as MetaEnv;

export type Severity = "debug" | "info" | "warn" | "error" | "fatal";
export type ObsContext = Record<string, unknown>;

export type ObsEvent = {
  /** Ten su kien on dinh, dung de nhom: "round.submit_failed", "ui.crash". */
  event: string;
  level: Severity;
  message?: string;
  route?: string;
  game?: string;
  durationMs?: number;
  statusCode?: number;
  context?: ObsContext;
};

export type ObsPayloadEvent = ObsEvent & {
  release: string;
  sessionId: string;
  userId: string | null;
  fingerprint: string;
  count: number;
  at: string;
};

export type Transport = (events: ObsPayloadEvent[]) => void;

export const MAX_TEXT_LEN = 300;
export const MAX_BATCH = 20;
export const DEDUPE_WINDOW_MS = 60_000;
export const FLUSH_INTERVAL_MS = 10_000;

const REDACTIONS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[jwt]"],
  [
    /(apikey|api_key|access_token|refresh_token|token|secret|password|authorization)(\s*[:=]\s*)[^\s,;"'}]+/gi,
    "$1$2[redacted]",
  ],
  [/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, "[email]"],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "[uuid]",
  ],
  [/\b\d{9,}\b/g, "[num]"],
];

/** Lam sach mot chuoi: bo PII/bi mat roi cat ngan. */
export function scrubText(input: unknown, maxLen = MAX_TEXT_LEN): string {
  let text: string;
  if (typeof input === "string") text = input;
  else if (input instanceof Error) text = `${input.name}: ${input.message}`;
  else if (input == null) text = "";
  else {
    try {
      text = JSON.stringify(input) ?? String(input);
    } catch {
      text = String(input);
    }
  }
  for (const [pattern, replacement] of REDACTIONS)
    text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}\u2026` : text;
}

/** Bo phan bien doi (so, uuid) de cung mot loi luon ra cung mot van tay. */
export function normalizeForFingerprint(message: string): string {
  return message
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Bam djb2 -> chuoi base36 ngan, du de nhom loi giong nhau. */
export function fingerprintOf(parts: Array<string | undefined>): string {
  const input = parts.filter(Boolean).join("|");
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1)
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Cat gon context: toi da 20 khoa, moi gia tri da lam sach, tong <= 2000 ky tu. */
export function scrubContext(context: ObsContext | undefined): ObsContext {
  if (!context || typeof context !== "object") return {};
  const out: ObsContext = {};
  let budget = 2000;
  for (const [key, value] of Object.entries(context).slice(0, 20)) {
    if (budget <= 0) break;
    const safeKey = key.slice(0, 40);
    if (typeof value === "number" && Number.isFinite(value)) {
      out[safeKey] = value;
      budget -= 8;
    } else if (typeof value === "boolean" || value === null) {
      out[safeKey] = value;
      budget -= 4;
    } else {
      const text = scrubText(value, Math.min(MAX_TEXT_LEN, budget));
      out[safeKey] = text;
      budget -= text.length;
    }
  }
  return out;
}

export type CollectorOptions = {
  transport: Transport;
  release?: string;
  sessionId?: string;
  now?: () => number;
  maxBatch?: number;
  dedupeWindowMs?: number;
  /** Ty le lay mau cho debug/info (0..1). Warn/error/fatal luon gui. */
  sampleRate?: number;
  random?: () => number;
};

export type Collector = {
  capture(event: ObsEvent): void;
  captureError(error: unknown, extra?: Partial<ObsEvent>): void;
  setUser(userId: string | null): void;
  flush(): void;
  pending(): number;
};

/**
 * Bo gom su kien thuan (khong DOM, khong timer) — chinh la thu duoc unit test.
 * Ban singleton ben duoi chi la lop vo boc quanh no.
 */
export function createCollector(options: CollectorOptions): Collector {
  const {
    transport,
    release = APP_VERSION,
    sessionId = "test-session",
    now = () => Date.now(),
    maxBatch = MAX_BATCH,
    dedupeWindowMs = DEDUPE_WINDOW_MS,
    sampleRate = 1,
    random = Math.random,
  } = options;

  const queue = new Map<string, ObsPayloadEvent>();
  const lastSeen = new Map<string, number>();
  let userId: string | null = null;

  const isNoisy = (level: Severity) => level === "debug" || level === "info";

  function capture(event: ObsEvent): void {
    try {
      const level: Severity = event.level ?? "info";
      if (isNoisy(level) && sampleRate < 1 && random() > sampleRate) return;

      const name = scrubText(event.event, 80) || "unknown";
      const message = event.message ? scrubText(event.message) : undefined;
      const route = event.route ? scrubText(event.route, 120) : undefined;
      const fingerprint = fingerprintOf([
        name,
        level,
        normalizeForFingerprint(message ?? ""),
        route,
      ]);

      const at = now();
      const seenAt = lastSeen.get(fingerprint);
      const existing = queue.get(fingerprint);
      if (existing && seenAt != null && at - seenAt < dedupeWindowMs) {
        existing.count += 1;
        return;
      }
      lastSeen.set(fingerprint, at);

      queue.set(fingerprint, {
        event: name,
        level,
        message,
        route,
        game: event.game ? scrubText(event.game, 20) : undefined,
        durationMs:
          typeof event.durationMs === "number" &&
          Number.isFinite(event.durationMs)
            ? Math.round(event.durationMs)
            : undefined,
        statusCode:
          typeof event.statusCode === "number" &&
          Number.isFinite(event.statusCode)
            ? Math.round(event.statusCode)
            : undefined,
        context: scrubContext(event.context),
        release,
        sessionId,
        userId,
        fingerprint,
        count: 1,
        at: new Date(at).toISOString(),
      });

      if (queue.size >= maxBatch) flush();
    } catch {
      // Telemetry khong bao gio duoc lam vo app.
    }
  }

  function captureError(error: unknown, extra: Partial<ObsEvent> = {}): void {
    const stack =
      error instanceof Error && typeof error.stack === "string"
        ? scrubText(error.stack.split("\n").slice(0, 4).join(" \u2190 "))
        : undefined;
    capture({
      event: extra.event ?? "client.error",
      level: extra.level ?? "error",
      message: extra.message ?? scrubText(error),
      route: extra.route,
      game: extra.game,
      statusCode: extra.statusCode,
      durationMs: extra.durationMs,
      context: { ...(extra.context ?? {}), ...(stack ? { stack } : {}) },
    });
  }

  function flush(): void {
    if (queue.size === 0) return;
    const events = [...queue.values()];
    queue.clear();
    try {
      transport(events);
    } catch {
      // bo qua
    }
  }

  return {
    capture,
    captureError,
    setUser(next: string | null) {
      userId = next;
    },
    flush,
    pending: () => queue.size,
  };
}

// ─── Ban singleton dung trong app ────────────────────────────────────────────

const ENDPOINT =
  ENV.VITE_TELEMETRY_ENDPOINT ?? `${FUNCTIONS_BASE}/telemetry`;

function readSessionId(): string {
  const KEY = "mindgem.obs.session";
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return `anon-${Date.now().toString(36)}`;
  }
}

function httpTransport(events: ObsPayloadEvent[]): void {
  // Thieu cau hinh Supabase (vd. quen set env tren Vercel) => bo qua im
  // lang, giu dung nguyen tac 'telemetry chet thi app van chay'.
  if (!HAS_SUPABASE_CONFIG && !ENV.VITE_TELEMETRY_ENDPOINT) return;
  const body = JSON.stringify({ events });
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body,
    }).catch(() => {});
  } catch {
    // offline / bi chan: bo qua
  }
}

const DISABLED = ENV.VITE_TELEMETRY_OFF === "1";
const SAMPLE = Number(ENV.VITE_TELEMETRY_SAMPLE ?? "1");

let collector: Collector | null = null;
let started = false;

function lazyCollector(): Collector | null {
  if (DISABLED) return null;
  if (!collector) {
    collector = createCollector({
      transport: httpTransport,
      sessionId: readSessionId(),
      sampleRate: Number.isFinite(SAMPLE) ? Math.max(0, Math.min(1, SAMPLE)) : 1,
    });
  }
  return collector;
}

/** Goi mot lan trong main.tsx. Bat loi toan cuc + tu flush khi roi trang. */
export function initObservability(): void {
  if (started || DISABLED || typeof window === "undefined") return;
  started = true;
  const sink = lazyCollector();
  if (!sink) return;

  window.addEventListener("error", (e: ErrorEvent) => {
    sink.captureError(e.error ?? e.message, {
      event: "window.error",
      route: location.pathname,
      context: { source: scrubText(e.filename, 120), line: e.lineno ?? 0 },
    });
  });

  window.addEventListener(
    "unhandledrejection",
    (e: PromiseRejectionEvent) => {
      sink.captureError(e.reason, {
        event: "window.unhandledrejection",
        route: location.pathname,
      });
    },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sink.flush();
  });
  window.addEventListener("pagehide", () => sink.flush());
  window.setInterval(() => sink.flush(), FLUSH_INTERVAL_MS);

  sink.capture({
    event: "app.start",
    level: "info",
    route: location.pathname,
    context: { release: APP_VERSION },
  });
}

export function captureError(error: unknown, extra?: Partial<ObsEvent>): void {
  lazyCollector()?.captureError(error, extra);
}

export function captureMessage(
  message: string,
  level: Severity = "warn",
  extra?: Partial<ObsEvent>,
): void {
  lazyCollector()?.capture({
    event: extra?.event ?? "client.message",
    level,
    message,
    route: extra?.route,
    game: extra?.game,
    statusCode: extra?.statusCode,
    durationMs: extra?.durationMs,
    context: extra?.context,
  });
}

export function captureEvent(event: ObsEvent): void {
  lazyCollector()?.capture(event);
}

/** Do thoi gian mot tac vu (vd. submit-round) va ghi lai ca khi that bai. */
export async function trackTiming<T>(
  name: string,
  run: () => Promise<T>,
  extra?: Partial<ObsEvent>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    captureEvent({
      event: name,
      level: "info",
      durationMs: Date.now() - startedAt,
      game: extra?.game,
      context: extra?.context,
    });
    return result;
  } catch (err) {
    captureError(err, {
      event: `${name}.failed`,
      durationMs: Date.now() - startedAt,
      game: extra?.game,
      context: extra?.context,
    });
    throw err;
  }
}

export function setObservabilityUser(userId: string | null): void {
  lazyCollector()?.setUser(userId);
}

export function flushObservability(): void {
  lazyCollector()?.flush();
}
