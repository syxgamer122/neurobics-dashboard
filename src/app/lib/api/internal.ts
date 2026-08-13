/**
 * Shared plumbing for the api modules: the Supabase client singleton,
 * the Profile shape, error formatting, column lists and date helpers.
 *
 * Not part of the public surface - import from "../api" instead.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  FUNCTIONS_BASE,
  assertSupabaseConfig,
} from "../supabase-config";
import { SESSION_COLUMNS, type SessionColumn } from "../game-registry";
import { sanitizeRating, decayRating, daysSince } from "../scoring";

// ─── Supabase client singleton ───────────────────────────────────────────────
// Stashed on globalThis so that even if this module is evaluated more than once
// (e.g. imported via two different specifiers by the bundler), only ONE
// GoTrueClient is ever created — avoiding the "Multiple GoTrueClient instances"
// warning and the split-session bugs it causes.
const CLIENT_KEY = "__mindgem_supabase_client__";
type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: SupabaseClient };

export function getSupabase(): SupabaseClient {
  const g = globalThis as GlobalWithClient;
  if (!g[CLIENT_KEY]) {
    assertSupabaseConfig();
    g[CLIENT_KEY] = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return g[CLIENT_KEY]!;
}

// Signup still goes through the server: creating an auth user with a confirmed
// email requires the service-role key, which must never reach the browser.
// Everything else reads/writes the genuine public.profiles table directly via
// the authenticated client (RLS scopes writes to the user's own row).
export const BASE = FUNCTIONS_BASE;

export type Profile = {
  id: string;
  username: string;
  // The 5 cognitive axes are proficiency ratings in [0, 1000] (upward-only
  // moving averages), NOT cumulative point totals.
  cfop_spatial_record: number | null; // spatial proficiency rating
  spatial_score: number; // Normalized fallback
  algebraic_logic_score: number; // logic proficiency rating
  memory_score: number; // memory proficiency rating
  speed_score: number; // speed proficiency rating
  focus_score: number; // focus proficiency rating
  total_xp: number; // cumulative XP (drives Level)
  last_active_date: string | null; // YYYY-MM-DD (VN calendar day)
  // Anchors "brain age" to a real age. Nullable: pre-existing accounts never
  // supplied it, and the UI asks for it rather than inventing a number.
  birth_year: number | null;
  // Public avatar URL in the `avatars` storage bucket (nullable until uploaded).
  avatar_url: string | null;
  // Server-controlled: 'user' | 'admin'. Never trust username for privilege.
  role: "user" | "admin";
  created_at: string;
} & Record<SessionColumn, number>;

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// ─── Data (genuine public.profiles table) ───────────────────────────────────────

// Turn a PostgrestError (plain object, not an Error) into a readable message.
export const IS_DEV = import.meta.env.DEV;

/**
 * Ca hai fallback duoi day keo hang tram dong ve trinh duyet roi sap xep
 * tai chO. Chung chi ton tai de app khong chet khi migration chua chay —
 * KHONG duoc coi la duong chinh. Neu thay canh bao nay trong production,
 * hay chay migration supabase/migrations/ roi kiem tra lai.
 */
export const MIGRATION_HINT =
  "Run the SQL migrations in supabase/migrations/ to restore the RPC.";

export function describeError(err: unknown, context: string): string {
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  if (e && typeof e === "object") {
    // Production: chi giu message + code. details/hint cua Postgres lo ten bang,
    // ten cot va cau truy van — khong day ra cho nguoi dung cuoi.
    const parts = IS_DEV
      ? [e.message, e.details, e.hint].filter(Boolean)
      : [e.message].filter(Boolean);
    const msg = parts.length
      ? parts.join(" · ")
      : IS_DEV
        ? JSON.stringify(e)
        : "Unexpected error";
    return e.code ? `${context}: [${e.code}] ${msg}` : `${context}: ${msg}`;
  }
  return `${context}: ${IS_DEV ? String(err) : "Unexpected error"}`;
}

/** Check if an error is likely due to network/offline conditions. */
export function isNetworkErrorLike(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch|NetworkError|FetchError|Load failed|offline|network/i.test(msg);
}

// Select all columns so the app keeps working before/after the ALTER TABLE
// migration adds memory_score, speed_score, focus_score, last_active_date.
export const PROFILE_COLS =
  "id, username, avatar_url, role, birth_year, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, total_xp, last_active_date, schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions, memory_sessions, nback_sessions, math_sessions, gonogo_sessions, mental_sessions, corsi_sessions, trail_sessions, created_at";

// Danh sách rút gọn dùng cho bảng xếp hạng và thống kê quần thể. Hai truy vấn đó
// đọc hồ sơ của MỌI người chơi, nên tuyệt đối không dùng "*" — làm thế là gửi
// birth_year và mọi cột riêng tư của toàn bộ người dùng về máy từng người.
// Phải viết thắng thành một chuỗi hằng: supabase-js đọc nội dung chuỗi này ở
// tầng kiểu để suy ra kiểu của `data`. Dùng [...].join() sẽ cho kiểu `string`
// chung chung, khiến TypeScript trả về GenericStringError\[\] và báo lỗi ép kiểu.
export const LEADERBOARD_COLS =
  "id, username, avatar_url, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, total_xp, last_active_date, schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions, memory_sessions, nback_sessions, math_sessions, gonogo_sessions, mental_sessions, corsi_sessions, trail_sessions, created_at";

/** Sanitize every cognitive axis on a freshly-fetched profile. */
export function sanitizeProfile(p: Profile): Profile {
  const sessionCounts = Object.fromEntries(
    SESSION_COLUMNS.map((column) => [column, Number(p[column] ?? 0) || 0]),
  ) as Record<SessionColumn, number>;
  const spatialScoreRaw = p.spatial_score ?? p.cfop_spatial_record ?? 0;
  return {
    ...p,
    ...sessionCounts,
    algebraic_logic_score: sanitizeRating(p.algebraic_logic_score),
    focus_score: sanitizeRating(p.focus_score),
    speed_score: sanitizeRating(p.speed_score),
    memory_score: sanitizeRating(p.memory_score),
    cfop_spatial_record: sanitizeRating(p.cfop_spatial_record),
    spatial_score: sanitizeRating(spatialScoreRaw),
  };
}

/**
 * Sanitize AND apply inactivity decay. Used on every read path so the dashboard,
 * the leaderboard and the brain age all reflect current form rather than an
 * all-time peak. The decayed values are not written back here: the app feeds
 * them into pullUpRating as the new baseline, so the next completed round
 * persists the decay naturally without an extra round-trip.
 */
export function hydrateProfile(p: Profile): Profile {
  const clean = sanitizeProfile({
    ...p,
    avatar_url: p.avatar_url ?? null,
    birth_year: p.birth_year ?? null,
    role: p.role === "admin" ? "admin" : "user",
  });
  const idle = daysSince(clean.last_active_date);
  if (idle === 0) return clean;
  return {
    ...clean,
    algebraic_logic_score: decayRating(clean.algebraic_logic_score, idle),
    focus_score: decayRating(clean.focus_score, idle),
    speed_score: decayRating(clean.speed_score, idle),
    memory_score: decayRating(clean.memory_score, idle),
    cfop_spatial_record: decayRating(clean.cfop_spatial_record ?? 0, idle),
    spatial_score: decayRating(clean.spatial_score ?? 0, idle),
  };
}

/**
 * Updates the current user's row in public.profiles. RLS guarantees a user can
 * only update their own row (auth.uid() = id).
 * scoreType: "cfop_spatial_record" (solve time) or "algebraic_logic_score".
 */

// ─── Timezone utilities ──────────────────────────────────

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Calendar day (YYYY-MM-DD) for a given instant, in Vietnam time (UTC+7). */
export function vnDateString(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d);
}

/** Whole-day difference between two YYYY-MM-DD calendar dates. */
export function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ─── Profile settings (Phase 4) ───────────────────────────────────────────────

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function serverPost<T>(
  path: string,
  payload: unknown,
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated.");
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res
    .json()
    .catch(() => ({ error: "Invalid server response" }));
  if (!res.ok) throw new Error(body.error ?? `${path} failed (${res.status})`);
  return body as T;
}

export const DEVICE_KEY = "mindgem.device";

/** Dấu vân thô phía client — chỉ tín hiệu tham khảo (localStorage xoá là mất). Chống lạm dụng thật dựa rate-limit IP + captcha phía server. */
export function deviceFingerprint(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        (globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`) +
        `.${screen.width}x${screen.height}x${new Date().getTimezoneOffset()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `anon.${Date.now()}`;
  }
}

/**
 * Mốc 00:00 giờ Việt Nam của ngày hôm nay, tính thẳng từ UTC.
 *
 * Cách cũ (`new Date(now.toLocaleString("en-US", { timeZone: VN_TZ }))` rồi trừ
 * 7 tiếng) chỉ đúng khi trình duyệt chạy ở UTC. Với máy đang ở UTC+7 — tức gần
 * như toàn bộ người dùng — chuỗi giờ tường phân tích lại ra đúng thời điểm hiện
 * tại, trừ thêm 7 tiếng nữa là cửa sổ lùi về 17:00 hôm trước, khiến "XP hôm nay"
 * cộng nhầm cả XP của tối qua.
 */
export function vnDayStartUtc(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return new Date(`${ymd}T00:00:00+07:00`);
}

/** Mốc 00:00 giờ Việt Nam của ngày đầu tháng hiện tại. */
export function vnMonthStartUtc(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00+07:00`);
}

export const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
