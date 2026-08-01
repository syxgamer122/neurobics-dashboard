import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import {
  RATING_MAX,
  sanitizeRating,
  decayRating,
  daysSince,
  MIN_POPULATION,
  DEFAULT_POPULATION,
  type PopulationStats,
} from "./scoring";

// ─── Supabase client singleton ───────────────────────────────────────────────
// Stashed on globalThis so that even if this module is evaluated more than once
// (e.g. imported via two different specifiers by the bundler), only ONE
// GoTrueClient is ever created — avoiding the "Multiple GoTrueClient instances"
// warning and the split-session bugs it causes.
const CLIENT_KEY = "__neurobics_supabase_client__";
type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: SupabaseClient };

export function getSupabase(): SupabaseClient {
  const g = globalThis as GlobalWithClient;
  if (!g[CLIENT_KEY]) {
    g[CLIENT_KEY] = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
    );
  }
  return g[CLIENT_KEY]!;
}

// Signup still goes through the server: creating an auth user with a confirmed
// email requires the service-role key, which must never reach the browser.
// Everything else reads/writes the genuine public.profiles table directly via
// the authenticated client (RLS scopes writes to the user's own row).
const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

export type Profile = {
  id: string;
  username: string;
  synapse_streak: number;
  // The 5 cognitive axes are proficiency ratings in [0, 1000] (upward-only
  // moving averages), NOT cumulative point totals.
  cfop_spatial_record: number | null; // spatial proficiency rating
  algebraic_logic_score: number; // logic proficiency rating
  memory_score: number; // memory proficiency rating
  speed_score: number; // speed proficiency rating
  focus_score: number; // focus proficiency rating
  schulte_sessions: number;
  sudoku_sessions: number;
  stroop_sessions: number;
  reaction_sessions: number;
  memory_sessions: number;
  nback_sessions: number;
  math_sessions: number;
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
};

// Username -> spoofed email so users never provide a real email address.
const toEmail = (username: string) =>
  `${username.trim().toLowerCase()}@neurobics.local`;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type SignUpResult = {
  profile: Profile;
  /** Mã khôi phục một lần — chỉ hiện ngay lúc đăng ký, server không lưu bản rõ. */
  recoveryCode: string;
};

export async function handleSignUp(
  username: string,
  password: string,
  captchaToken: string,
): Promise<SignUpResult> {
  // Server creates the confirmed auth user; the on_auth_user_created trigger
  // auto-inserts the matching public.profiles row.
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ username, password, captchaToken }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    console.error("Sign up failed during account creation:", body);
    const reason = String(body.error ?? "Sign up failed.");
    throw new Error(body.code ? `${reason} [${body.code}]` : reason);
  }

  await handleLogin(username, password);
  return {
    profile: sanitizeProfile(body.profile as Profile),
    recoveryCode: String(body.recoveryCode ?? ""),
  };
}

/** Đặt lại mật khẩu bằng mã khôi phục đã cấp lúc đăng ký (email giả không nhận được mail). */
export async function resetPasswordWithRecoveryCode(
  username: string,
  recoveryCode: string,
  newPassword: string,
  captchaToken: string,
): Promise<void> {
  if (!username.trim() || !recoveryCode.trim() || !newPassword) {
    throw new Error("Username, recovery code and new password are required.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  const res = await fetch(`${BASE}/recover-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      username: username.trim(),
      recoveryCode: recoveryCode.trim(),
      newPassword,
      captchaToken,
    }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const reason = String(body.error ?? "Recovery failed.");
    throw new Error(body.code ? `${reason} [${body.code}]` : reason);
  }
}

export async function handleLogin(
  username: string,
  password: string,
): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password,
  });
  if (error || !data.session) {
    console.error(
      "Login failed during signInWithPassword:",
      error?.message,
      "(email:",
      toEmail(username),
      ")",
    );
    // Supabase returns the same generic message whether the account doesn't
    // exist or the password is wrong — make it actionable.
    if (error?.message?.toLowerCase().includes("invalid login credentials")) {
      throw new Error(
        `No account matched "${username.trim()}" / that password. If you haven't registered on this database yet, switch to Sign up to create it.`,
      );
    }
    throw new Error(error?.message ?? "Invalid username or password.");
  }
  return data.session.access_token;
}

export async function handleLogout(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) console.error("Logout error during signOut:", error.message);
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// ─── Data (genuine public.profiles table) ───────────────────────────────────────

// Turn a PostgrestError (plain object, not an Error) into a readable message.
function describeError(err: unknown, context: string): string {
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  if (e && typeof e === "object") {
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    const msg = parts.length ? parts.join(" · ") : JSON.stringify(e);
    return e.code ? `${context}: [${e.code}] ${msg}` : `${context}: ${msg}`;
  }
  return `${context}: ${String(err)}`;
}

// Select all columns so the app keeps working before/after the ALTER TABLE
// migration adds memory_score, speed_score, focus_score, last_active_date.
const PROFILE_COLS = "*";

// Danh sách rút gọn dùng cho bảng xếp hạng và thống kê quần thể. Hai truy vấn đó
// đọc hồ sơ của MỌI người chơi, nên tuyệt đối không dùng "*" — làm thế là gửi
// birth_year và mọi cột riêng tư của toàn bộ người dùng về máy từng người.
// Phải viết thắng thành một chuỗi hằng: supabase-js đọc nội dung chuỗi này ở
// tầng kiểu để suy ra kiểu của `data`. Dùng [...].join() sẽ cho kiểu `string`
// chung chung, khiến TypeScript trả về GenericStringError\[\] và báo lỗi ép kiểu.
const LEADERBOARD_COLS =
  "id, username, avatar_url, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, synapse_streak, total_xp, last_active_date, schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions, memory_sessions, nback_sessions, math_sessions, created_at";

// The rating scale and its guards live in ./scoring, the single source of truth
// for everything score-related. Re-exported so existing importers keep working.
export { RATING_MAX, sanitizeRating };

/** Sanitize every cognitive axis on a freshly-fetched profile. */
function sanitizeProfile(p: Profile): Profile {
  return {
    ...p,
    algebraic_logic_score: sanitizeRating(p.algebraic_logic_score),
    focus_score: sanitizeRating(p.focus_score),
    speed_score: sanitizeRating(p.speed_score),
    memory_score: sanitizeRating(p.memory_score),
    cfop_spatial_record: sanitizeRating(p.cfop_spatial_record),
  };
}

/**
 * Sanitize AND apply inactivity decay. Used on every read path so the dashboard,
 * the leaderboard and the brain age all reflect current form rather than an
 * all-time peak. The decayed values are not written back here: the app feeds
 * them into pullUpRating as the new baseline, so the next completed round
 * persists the decay naturally without an extra round-trip.
 */
function hydrateProfile(p: Profile): Profile {
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
  };
}

export async function fetchProfile(): Promise<Profile | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const msg = describeError(error, "Fetch profile failed");
    console.error(msg);
    throw new Error(msg);
  }
  return data ? hydrateProfile(data as Profile) : null;
}

/** Persists the user's birth year, which anchors the brain-age calculation. */
export async function saveBirthYear(birthYear: number): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Save birth year failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ birth_year: birthYear })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, "Save birth year failed");
    console.error(msg);
    throw new Error(msg);
  }
  return hydrateProfile(data as Profile);
}

/**
 * Updates the current user's row in public.profiles. RLS guarantees a user can
 * only update their own row (auth.uid() = id).
 * scoreType: "cfop_spatial_record" (solve time), "algebraic_logic_score", or "synapse_streak".
 */
export type ScoreColumn =
  | "cfop_spatial_record"
  | "algebraic_logic_score"
  | "synapse_streak"
  | "memory_score"
  | "speed_score"
  | "focus_score"
  | "schulte_sessions"
  | "sudoku_sessions"
  | "stroop_sessions"
  | "reaction_sessions"
  | "memory_sessions"
  | "total_xp";

/**
 * @deprecated Từ Giai đoạn 1, mọi cột điểm đã bị `revoke update` khỏi vai trò
 * `authenticated`, nên hàm này luôn thất bại với lỗi 42501. Điểm chỉ được ghi
 * qua Edge Function `submit-round`. Giữ lại t��m để không vỡ import cũ.
 */
export async function saveTrainingResult(
  scoreType: ScoreColumn,
  value: number,
): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId)
    throw new Error("Save training result failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ [scoreType]: value })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(
      error,
      `Save training result failed for ${scoreType}`,
    );
    console.error(msg);
    throw new Error(msg);
  }
  return sanitizeProfile(data as Profile);
}

/**
 * @deprecated Xem `saveTrainingResult`. Các cột điểm đã bị thu quyền ghi ở phía
 * database, hàm này không còn đường chạy thành công.
 */
export async function saveScores(
  updates: Partial<Record<ScoreColumn, number>>,
): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Save scores failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(
      error,
      `Save scores failed for [${Object.keys(updates).join(", ")}]`,
    );
    console.error(msg);
    throw new Error(msg);
  }
  return sanitizeProfile(data as Profile);
}

// ─── Daily streak (Asia/Ho_Chi_Minh timezone) ──────────────────────────────────

const VN_TZ = "Asia/Ho_Chi_Minh";

/** Calendar day (YYYY-MM-DD) for a given instant, in Vietnam time (UTC+7). */
function vnDateString(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d);
}

/** Whole-day difference between two YYYY-MM-DD calendar dates. */
function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Records activity for "today" in Vietnam time and updates the streak:
 *  - same VN day as last_active_date        → streak unchanged (already counted)
 *  - exactly 1 VN calendar day later         → streak + 1
 *  - more than 1 day later (or first ever)   → streak reset to 1
 * Writes both synapse_streak and last_active_date back to the row.
 */
/**
 * @deprecated Chuỗi ngày (streak) giờ do `submit_round_transaction` phía server
 * tự cập nhật. Không nơi nào trong ứng dụng gọi hàm này nữa.
 */
export async function recordDailyActivity(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId)
    throw new Error("Record daily activity failed: not authenticated.");

  const current = await fetchProfile();
  if (!current)
    throw new Error("Record daily activity failed: profile not found.");

  const today = vnDateString(new Date());
  let streak: number;

  if (!current.last_active_date) {
    streak = 1;
  } else if (current.last_active_date === today) {
    streak = current.synapse_streak; // already active today, no change
  } else {
    const diff = dayDiff(current.last_active_date, today);
    if (diff === 1) streak = current.synapse_streak + 1;
    else if (diff > 1) streak = 1;
    else streak = current.synapse_streak; // clock skew / past date, leave as-is
  }

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ synapse_streak: streak, last_active_date: today })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, "Record daily activity failed");
    console.error(msg);
    throw new Error(msg);
  }
  return sanitizeProfile(data as Profile);
}

// ─── Admin controls (active user) ───────────────────────────────────────────────

/**
 * @deprecated Client cannot write score columns (revoke update). Use admin-grant
 * Edge Function instead. Kept only so old imports fail loudly rather than 42501.
 */
export async function addPointsToActiveUser(_delta: number): Promise<Profile> {
  throw new Error(
    "addPointsToActiveUser is disabled: scores are server-only. Use admin-grant.",
  );
}

/**
 * Wipes all cognitive metrics and the streak back to 0 for the active user.
 * Forcefully zeroes ALL 5 axis columns (including cfop_spatial_record) so legacy
 * accounts with pre-migration cumulative values >1000 can be re-baselined — the
 * upward-only pullUpRating can never bring them back down on its own.
 */
export async function resetActiveUserScores(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Reset scores failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({
      algebraic_logic_score: 0,
      memory_score: 0,
      speed_score: 0,
      focus_score: 0,
      cfop_spatial_record: 0,
      synapse_streak: 0,
      schulte_sessions: 0,
      sudoku_sessions: 0,
      stroop_sessions: 0,
      reaction_sessions: 0,
      memory_sessions: 0,
      nback_sessions: 0,
      math_sessions: 0,
      total_xp: 0,
      last_active_date: null,
    })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, "Reset scores failed");
    console.error(msg);
    throw new Error(msg);
  }
  return sanitizeProfile(data as Profile);
}

// ─── Admin: operate on ANY user (requires admin RLS policy) ──────────────────

/** Fetch a single profile by ID (admin use). */
export async function adminFetchUser(targetId: string): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", targetId)
    .single();
  if (error) throw new Error(describeError(error, "adminFetchUser"));
  return hydrateProfile(data as Profile);
}

export const AXIS_COLUMNS = {
  logic: "algebraic_logic_score",
  memory: "memory_score",
  speed: "speed_score",
  focus: "focus_score",
  spatial: "cfop_spatial_record",
} as const;
export type AxisKey = keyof typeof AXIS_COLUMNS;
export type AdminGrant = {
  axes?: Partial<Record<AxisKey, number>>;
  xp?: number;
  mode?: "add" | "set";
};

async function adminFetchRaw(targetId: string): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", targetId)
    .single();
  if (error) throw new Error(describeError(error, "adminFetchRaw"));
  return sanitizeProfile(data as Profile);
}

export async function adminApplyGrant(
  targetId: string,
  grant: AdminGrant,
): Promise<Profile> {
  const result = await serverPost<{ profile: Profile }>("admin-grant", {
    targetId,
    ...grant,
  });
  return sanitizeProfile(result.profile);
}

/** Backward-compatible helper: add the same amount to every cognitive axis. */
export function adminAddPoints(
  targetId: string,
  delta: number,
): Promise<Profile> {
  return adminApplyGrant(targetId, {
    axes: {
      logic: delta,
      memory: delta,
      speed: delta,
      focus: delta,
      spatial: delta,
    },
  });
}

/** Reset all scores + streak of any user to 0 (all 5 axes forcefully zeroed). */
export async function adminResetScores(targetId: string): Promise<Profile> {
  const result = await serverPost<{ profile: Profile }>("admin-reset", {
    targetId,
  });
  return sanitizeProfile(result.profile);
}

/** Delete any user's profile row (does NOT remove auth user). */
export async function adminDeleteUser(targetId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("profiles")
    .delete()
    .eq("id", targetId);
  if (error) throw new Error(describeError(error, "adminDeleteUser"));
}

/**
 * Deletes the active account end-to-end via the Edge Function (service role):
 * profile row, avatars in storage, and the auth.users record. Then clears the
 * local session so the browser cannot reuse a dead JWT.
 */
export async function deleteActiveUserAccount(): Promise<void> {
  await serverPost<{ ok: true }>("delete-account", {});

  try {
    await getSupabase().auth.signOut();
  } catch {
    /* session may already be invalid after server-side auth.admin.deleteUser */
  }
  try {
    Object.keys(globalThis.localStorage ?? {})
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => globalThis.localStorage.removeItem(k));
  } catch {
    /* localStorage may be unavailable — signOut already handled the session */
  }
}

// ─── Profile settings (Phase 4) ───────────────────────────────────────────────

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Re-authenticate with the current password, then set a new one.
 * Username is mapped to the spoofed email the same way signup/login do.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!currentPassword || !newPassword) {
    throw new Error("Both current and new passwords are required.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  if (currentPassword === newPassword) {
    throw new Error("New password must be different from the current one.");
  }

  const {
    data: { user },
    error: userErr,
  } = await getSupabase().auth.getUser();
  if (userErr || !user?.email) {
    throw new Error("Change password failed: not authenticated.");
  }

  const { error: reauthErr } = await getSupabase().auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthErr) {
    throw new Error("Current password is incorrect.");
  }

  const { error } = await getSupabase().auth.updateUser({
    password: newPassword,
  });
  if (error) {
    throw new Error(error.message || "Change password failed.");
  }
}

/** Upload a new avatar image and persist its public URL on the profile. */
export async function uploadAvatar(file: File): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Upload avatar failed: not authenticated.");

  if (!AVATAR_MIME.has(file.type)) {
    throw new Error("Avatar must be JPEG, PNG, WebP, or GIF.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Avatar must be 2 MB or smaller.");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  // Fixed path so each upload overwrites the previous file for this user.
  const path = `${userId}/avatar.${ext}`;

  // Drop leftover files from previous uploads with a different extension
  // (avatar.jpg left behind after switching to avatar.png, etc.).
  const { data: listed } = await getSupabase().storage.from("avatars").list(userId);
  if (listed && listed.length > 0) {
    const stale = listed
      .map((f) => f.name)
      .filter((name) => name !== `avatar.${ext}`)
      .map((name) => `${userId}/${name}`);
    if (stale.length > 0) {
      await getSupabase().storage.from("avatars").remove(stale);
    }
  }

  const { error: upErr } = await getSupabase().storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (upErr) {
    throw new Error(describeError(upErr, "Upload avatar failed"));
  }

  const { data: pub } = getSupabase().storage.from("avatars").getPublicUrl(path);
  // Bust CDN/browser cache after overwrite.
  const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();
  if (error) {
    throw new Error(describeError(error, "Save avatar URL failed"));
  }
  return hydrateProfile(data as Profile);
}

/** Remove avatar file(s) for the current user and clear avatar_url. */
export async function removeAvatar(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Remove avatar failed: not authenticated.");

  const { data: listed } = await getSupabase().storage
    .from("avatars")
    .list(userId);
  if (listed && listed.length > 0) {
    const paths = listed.map((f) => `${userId}/${f.name}`);
    await getSupabase().storage.from("avatars").remove(paths);
  }

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();
  if (error) {
    throw new Error(describeError(error, "Clear avatar URL failed"));
  }
  return hydrateProfile(data as Profile);
}
// ─── XP awarding (server-side, tamper-resistant) ──────────────────────────────

export type XpAwardResult = {
  totalXp: number;
  xpAwarded: number;
  level: number;
  leveledUp: boolean;
};

/**
 * @deprecated Endpoint returns 410. XP is awarded inside submit-round.
 * Kept as a no-op so accidental callers do not hit the network.
 */
export async function awardXp(
  _game: string,
  _roundScore: number,
): Promise<XpAwardResult | null> {
  console.warn("awardXp is deprecated; XP comes from submit-round.");
  return null;
}

export type RoundGame =
  | "schulte"
  | "sudoku"
  | "stroop"
  | "reaction"
  | "memory"
  | "nback"
  | "math";
export type RoundTicket = {
  roundId: string;
  game: RoundGame;
  startedAt: string;
  expiresAt: string;
};
export type SubmittedRound = {
  profile: Profile;
  axes: {
    speed: number | null;
    focus: number | null;
    spatial: number | null;
    logic: number | null;
    memory: number | null;
  };
  headline: number;
  label: string;
  timeMs: number;
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
};

async function serverPost<T>(path: string, payload: unknown): Promise<T> {
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

const DEVICE_KEY = "neurobics.device";

/** Dấu vân thô phía client — server chỉ dùng để phát hiện nhiều tài khoản. */
function deviceFingerprint(): string {
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

/** Obtain a short-lived, one-use round ticket before play. */
export const startRound = (game: RoundGame): Promise<RoundTicket> =>
  serverPost<RoundTicket>("start-round", { game });

/** One finish request: server scores telemetry and atomically saves everything. */
export async function submitRound(
  roundId: string,
  game: RoundGame,
  telemetry: unknown,
): Promise<SubmittedRound> {
  const result = await serverPost<SubmittedRound>("submit-round", {
    roundId,
    game,
    telemetry,
    fingerprint: deviceFingerprint(),
  });
  return { ...result, profile: sanitizeProfile(result.profile) };
}

/** Global Cognitive Index = average of the 5 cognitive axes (0–1000). */
export function cognitiveIndex(p: Profile): number {
  const sum =
    (p.algebraic_logic_score ?? 0) +
    (p.focus_score ?? 0) +
    (p.speed_score ?? 0) +
    (p.memory_score ?? 0) +
    (p.cfop_spatial_record ?? 0);
  return sum / 5;
}

export async function fetchLeaderboard(): Promise<Profile[]> {
  // Prefer the Postgres RPC (ordered by generated cognitive_index). Fall back
  // to a client-side sort only if the migration has not been applied yet.
  const { data, error } = await getSupabase().rpc("get_leaderboard", {
    p_limit: 25,
  });

  if (!error) {
    return ((data ?? []) as Profile[]).map(hydrateProfile);
  }

  console.warn(
    "get_leaderboard RPC unavailable, falling back to client sort:",
    error.message,
  );
  const fb = await getSupabase().from("profiles").select(LEADERBOARD_COLS).limit(200);
  if (fb.error) {
    throw new Error(describeError(fb.error, "Fetch leaderboard failed"));
  }
  return ((fb.data ?? []) as Profile[])
    .map(hydrateProfile)
    .sort((a, b) => cognitiveIndex(b) - cognitiveIndex(a))
    .slice(0, 25);
}

/**
 * Real distribution of Cognitive Index across the user base, used to rank a
 * player for their brain age. This replaces the old hard-coded "population
 * baseline = 38 years", which was not derived from any population at all.
 *
 * Only players past the calibration threshold are counted — a wave of empty
 * new accounts would otherwise drag the mean toward 0 and make everyone look
 * like a genius.
 */
export async function fetchPopulationStats(): Promise<PopulationStats> {
  // Prefer the Postgres RPC (avg + stddev_samp over calibrated players).
  const { data, error } = await getSupabase().rpc("get_population_stats", {
    p_min_rounds: 5,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const n = Number(row?.n ?? 0);
    if (n < MIN_POPULATION) return { ...DEFAULT_POPULATION, n };
    const mean = Number(row?.mean ?? DEFAULT_POPULATION.mean);
    const sd = Number(row?.sd ?? 0);
    return { mean, sd: sd > 1 ? sd : DEFAULT_POPULATION.sd, n };
  }

  console.warn(
    "get_population_stats RPC unavailable, falling back to client stats:",
    error.message,
  );

  const fb = await getSupabase()
    .from("profiles")
    .select(LEADERBOARD_COLS)
    .limit(1000);

  if (fb.error) {
    console.error(describeError(fb.error, "Fetch population stats failed"));
    return DEFAULT_POPULATION;
  }

  const indices = ((fb.data ?? []) as Profile[])
    .map(hydrateProfile)
    .filter(
      (p) =>
        (p.schulte_sessions ?? 0) +
        (p.sudoku_sessions ?? 0) +
        (p.stroop_sessions ?? 0) +
        (p.reaction_sessions ?? 0) +
        (p.memory_sessions ?? 0) >=
        5,
    )
    .map(cognitiveIndex);

  if (indices.length < MIN_POPULATION)
    return { ...DEFAULT_POPULATION, n: indices.length };

  const mean = indices.reduce((s, x) => s + x, 0) / indices.length;
  const variance =
    indices.reduce((s, x) => s + (x - mean) ** 2, 0) / (indices.length - 1);
  const sd = Math.sqrt(variance);

  return { mean, sd: sd > 1 ? sd : DEFAULT_POPULATION.sd, n: indices.length };
}
// ─── Activity stats ───────────────────────────────────────────────────────────

export type ActivityStats = {
  xpToday: number;
  sessionsThisMonth: number;
};

/**
 * Mốc 00:00 giờ Việt Nam của ngày hôm nay, tính thẳng từ UTC.
 *
 * Cách cũ (`new Date(now.toLocaleString("en-US", { timeZone: VN_TZ }))` rồi trừ
 * 7 tiếng) chỉ đúng khi trình duyệt chạy ở UTC. Với máy đang ở UTC+7 — tức gần
 * như toàn bộ người dùng — chuỗi giờ tường phân tích lại ra đúng thời điểm hiện
 * tại, trừ thêm 7 tiếng nữa là cửa sổ lùi về 17:00 hôm trước, khiến "XP hôm nay"
 * cộng nhầm cả XP của tối qua.
 */
function vnDayStartUtc(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return new Date(`${ymd}T00:00:00+07:00`);
}

/** Mốc 00:00 giờ Việt Nam của ngày đầu tháng hiện tại. */
function vnMonthStartUtc(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00+07:00`);
}

export async function fetchActivityStats(): Promise<ActivityStats> {
  const userId = await currentUserId();
  if (!userId) return { xpToday: 0, sessionsThisMonth: 0 };

  // Prefer server aggregate (VN day/month bounds inside Postgres).
  const { data, error } = await getSupabase().rpc("get_activity_stats");
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return {
      xpToday: Number(row?.xp_today ?? 0),
      sessionsThisMonth: Number(row?.sessions_this_month ?? 0),
    };
  }

  console.warn(
    "get_activity_stats RPC unavailable, falling back to client aggregate:",
    error.message,
  );

  const now = new Date();
  const dayStart = vnDayStartUtc(now);
  const monthStart = vnMonthStartUtc(now);

  const fb = await getSupabase()
    .from("xp_events")
    .select("xp_awarded, created_at")
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  if (fb.error) throw new Error(`Fetch activity stats failed: ${fb.error.message}`);

  const dayStartMs = dayStart.getTime();
  const rows = fb.data ?? [];
  let xpToday = 0;
  for (const row of rows) {
    if (Date.parse(row.created_at) >= dayStartMs) xpToday += row.xp_awarded ?? 0;
  }
  return { xpToday, sessionsThisMonth: rows.length };
}
// ─── Giai đoạn 2: Lịch sử luyện tập ─────────────────────────────────────────

export type TrainingSession = {
  id: string;
  game: RoundGame;
  label: string | null;
  round_score: number;
  xp_awarded: number;
  time_ms: number;
  speed_score: number | null;
  focus_score: number | null;
  spatial_score: number | null;
  logic_score: number | null;
  memory_score: number | null;
  created_at: string;
};

/** Các ván gần đây của chính người đang đăng nhập (RLS chỉ cho đọc row của mình). */
export async function fetchTrainingHistory(
  opts: { game?: RoundGame | "all"; limit?: number } = {},
): Promise<TrainingSession[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  let query = getSupabase()
    .from("training_sessions")
    .select(
      "id, game, label, round_score, xp_awarded, time_ms, speed_score, focus_score, spatial_score, logic_score, memory_score, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));

  if (opts.game && opts.game !== "all") query = query.eq("game", opts.game);

  const { data, error } = await query;
  if (error) throw new Error(`Fetch training history failed: ${error.message}`);
  return (data ?? []) as TrainingSession[];
}

export type PersonalBest = {
  game: RoundGame;
  rounds: number;
  best_score: number;
  best_time_ms: number;
  avg_score: number;
  total_xp: number;
  last_played_at: string;
};

/** Kỷ lục cá nhân theo từng game, tính ở phía Postgres cho nhanh. */
export async function fetchPersonalBests(): Promise<PersonalBest[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_personal_bests", {
    p_user_id: userId,
  });
  if (error) throw new Error(`Fetch personal bests failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    game: row.game as RoundGame,
    rounds: Number(row.rounds ?? 0),
    best_score: Number(row.best_score ?? 0),
    best_time_ms: Number(row.best_time_ms ?? 0),
    avg_score: Number(row.avg_score ?? 0),
    total_xp: Number(row.total_xp ?? 0),
    last_played_at: String(row.last_played_at ?? ""),
  }));
}

// ─── Giai đoạn 3: chuỗi tiến trình theo ngày ───

export type ProgressPoint = {
  day: string;
  rounds: number;
  xp: number;
  avg_score: number | null;
  best_score: number | null;
  speed: number | null;
  focus: number | null;
  spatial: number | null;
  logic: number | null;
  memory: number | null;
};

const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * Số liệu luyện tập gộp theo ngày (giờ Việt Nam) cho N ngày gần nhất.
 * Hàm SQL tự lấy auth.uid() nên không truyền user id từ trình duyệt.
 * Ngày không chơi vẫn có một dòng với rounds = 0 và các trục = null.
 */
export async function fetchProgressSeries(days = 30): Promise<ProgressPoint[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_progress_series", {
    p_days: days,
  });
  if (error) throw new Error(`Fetch progress series failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    day: String(row.day ?? ""),
    rounds: Number(row.rounds ?? 0),
    xp: Number(row.xp ?? 0),
    avg_score: numOrNull(row.avg_score),
    best_score: numOrNull(row.best_score),
    speed: numOrNull(row.speed),
    focus: numOrNull(row.focus),
    spatial: numOrNull(row.spatial),
    logic: numOrNull(row.logic),
    memory: numOrNull(row.memory),
  }));
}

// ─── Giai đoạn 5: thành tựu, nhiệm vụ ngày, bạn bè ──────────────────────────
// Mọi điều kiện mở khoá và phần thưởng XP đều được tính lại trong Postgres.
// Trình duyệt chỉ đọc kết quả, không bao giờ tự khai báo đã hoàn thành.

export type AchievementUnlock = {
  code: string;
  unlocked_at: string;
  newly_unlocked: boolean;
};

/**
 * Xét lại toàn bộ thành tựu từ dữ liệu thật và trả về danh sách đã mở khoá.
 * `newly_unlocked` đánh dấu những cái vừa mở trong lần gọi này để hiện hiệu ứng.
 */
export async function syncAchievements(): Promise<AchievementUnlock[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("sync_achievements");
  if (error) throw new Error(`Sync achievements failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    code: String(row.code ?? ""),
    unlocked_at: String(row.unlocked_at ?? ""),
    newly_unlocked: Boolean(row.newly_unlocked),
  }));
}

export type DailyQuest = {
  code: string;
  progress: number;
  goal: number;
  xp_reward: number;
  claimed: boolean;
};

/** Tiến độ nhiệm vụ hôm nay, mốc ngày theo giờ Việt Nam. */
export async function fetchDailyQuests(): Promise<DailyQuest[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_daily_quests");
  if (error) throw new Error(`Fetch daily quests failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    code: String(row.code ?? ""),
    progress: Number(row.progress ?? 0),
    goal: Number(row.goal ?? 1),
    xp_reward: Number(row.xp_reward ?? 0),
    claimed: Boolean(row.claimed),
  }));
}

/** Nhận thưởng một nhiệm vụ. Server tự kiểm tra đủ điều kiện và chưa nhận. */
export async function claimQuest(
  code: string,
): Promise<{ code: string; xpAwarded: number; totalXp: number }> {
  const { data, error } = await getSupabase().rpc("claim_quest", {
    p_code: code,
  });
  if (error) throw new Error(error.message);

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    code: String(row.code ?? code),
    xpAwarded: Number(row.xpAwarded ?? 0),
    totalXp: Number(row.totalXp ?? 0),
  };
}

export type PlayerSearchResult = {
  id: string;
  username: string;
  avatar_url: string | null;
  cognitive_index: number;
};

/** Tìm người chơi theo tên, tối thiểu 2 ký tự. */
export async function searchPlayers(
  query: string,
): Promise<PlayerSearchResult[]> {
  if (query.trim().length < 2) return [];

  const { data, error } = await getSupabase().rpc("search_players", {
    p_query: query.trim(),
    p_limit: 10,
  });
  if (error) throw new Error(`Search players failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    username: String(row.username ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    cognitive_index: Number(row.cognitive_index ?? 0),
  }));
}

export type FriendEntry = {
  friendship_id: string;
  player_id: string;
  username: string;
  avatar_url: string | null;
  status: "pending" | "accepted";
  direction: "friend" | "incoming" | "outgoing";
  created_at: string;
};

/** Bạn bè đã kết nối + lời mời hai chiều trong một lần gọi. */
export async function fetchFriends(): Promise<FriendEntry[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_friends");
  if (error) throw new Error(`Fetch friends failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    friendship_id: String(row.friendship_id ?? ""),
    player_id: String(row.player_id ?? ""),
    username: String(row.username ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    status: (row.status as "pending" | "accepted") ?? "pending",
    direction:
      (row.direction as "friend" | "incoming" | "outgoing") ?? "outgoing",
    created_at: String(row.created_at ?? ""),
  }));
}

export async function sendFriendRequest(targetId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("send_friend_request", {
    p_target: targetId,
  });
  if (error) throw new Error(error.message);
  return String((data as Record<string, unknown>)?.status ?? "pending");
}

export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean,
): Promise<string> {
  const { data, error } = await getSupabase().rpc("respond_friend_request", {
    p_request: friendshipId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
  return String((data as Record<string, unknown>)?.status ?? "declined");
}

export async function removeFriend(playerId: string): Promise<void> {
  const { error } = await getSupabase().rpc("remove_friend", {
    p_other: playerId,
  });
  if (error) throw new Error(error.message);
}

export type FriendRank = {
  id: string;
  username: string;
  avatar_url: string | null;
  cognitive_index: number;
  total_xp: number;
  synapse_streak: number;
  is_me: boolean;
};

/** Bảng xếp hạng chỉ gồm bạn bè đã chấp nhận và chính mình. */
export async function fetchFriendLeaderboard(): Promise<FriendRank[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_friend_leaderboard");
  if (error) throw new Error(`Fetch friend leaderboard failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    username: String(row.username ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    cognitive_index: Number(row.cognitive_index ?? 0),
    total_xp: Number(row.total_xp ?? 0),
    synapse_streak: Number(row.synapse_streak ?? 0),
    is_me: Boolean(row.is_me),
  }));
}
