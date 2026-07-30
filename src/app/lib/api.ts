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
    g[CLIENT_KEY] = createClient(`https://${projectId}.supabase.co`, publicAnonKey);
  }
  return g[CLIENT_KEY]!;
}

// Signup still goes through the server: creating an auth user with a confirmed
// email requires the service-role key, which must never reach the browser.
// Everything else reads/writes the genuine public.profiles table directly via
// the authenticated client (RLS scopes writes to the user's own row).
const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-1e03ae23`;

export type Profile = {
  id: string;
  username: string;
  synapse_streak: number;
  // The 5 cognitive axes are proficiency ratings in [0, 1000] (upward-only
  // moving averages), NOT cumulative point totals.
  cfop_spatial_record: number | null; // spatial proficiency rating
  algebraic_logic_score: number;      // logic proficiency rating
  memory_score: number;               // memory proficiency rating
  speed_score: number;                // speed proficiency rating
  focus_score: number;                // focus proficiency rating
  schulte_sessions: number;           // total Schulte rounds completed
  sudoku_sessions: number;            // total Sudoku rounds completed
  stroop_sessions: number;            // total Stroop rounds completed
  reaction_sessions: number;
  total_xp: number;                    // cumulative XP (drives Level)
  last_active_date: string | null;    // YYYY-MM-DD (VN calendar day)
  // Anchors "brain age" to a real age. Nullable: pre-existing accounts never
  // supplied it, and the UI asks for it rather than inventing a number.
  birth_year: number | null;
  created_at: string;
};

// Username -> spoofed email so users never provide a real email address.
const toEmail = (username: string) => `${username.trim().toLowerCase()}@neurobics.local`;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function handleSignUp(username: string, password: string, captchaToken: string): Promise<Profile> {
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
  const body = await res.json();
  if (!res.ok) {
    console.error("Sign up failed during account creation:", body.error);
    throw new Error(body.error ?? "Sign up failed.");
  }

  // Immediately sign the new user in.
  await handleLogin(username, password);
  return body.profile as Profile;
}

export async function handleLogin(username: string, password: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password,
  });
  if (error || !data.session) {
    console.error("Login failed during signInWithPassword:", error?.message, "(email:", toEmail(username), ")");
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
  const e = err as { message?: string; details?: string; hint?: string; code?: string } | null;
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

// The rating scale and its guards live in ./scoring, the single source of truth
// for everything score-related. Re-exported so existing importers keep working.
export { RATING_MAX, sanitizeRating };

/** Sanitize every cognitive axis on a freshly-fetched profile. */
function sanitizeProfile(p: Profile): Profile {
  return {
    ...p,
    algebraic_logic_score: sanitizeRating(p.algebraic_logic_score),
    focus_score:           sanitizeRating(p.focus_score),
    speed_score:           sanitizeRating(p.speed_score),
    memory_score:          sanitizeRating(p.memory_score),
    cfop_spatial_record:   sanitizeRating(p.cfop_spatial_record),
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
  const clean = sanitizeProfile(p);
  const idle = daysSince(clean.last_active_date);
  if (idle === 0) return clean;
  return {
    ...clean,
    algebraic_logic_score: decayRating(clean.algebraic_logic_score, idle),
    focus_score:           decayRating(clean.focus_score, idle),
    speed_score:           decayRating(clean.speed_score, idle),
    memory_score:          decayRating(clean.memory_score, idle),
    cfop_spatial_record:   decayRating(clean.cfop_spatial_record ?? 0, idle),
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
  | "total_xp";

export async function saveTrainingResult(
  scoreType: ScoreColumn,
  value: number,
): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Save training result failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ [scoreType]: value })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, `Save training result failed for ${scoreType}`);
    console.error(msg);
    throw new Error(msg);
  }
  return data as Profile;
}

/**
 * Updates several score columns for the current user in a single request.
 * RLS scopes the write to the user's own row.
 */
export async function saveScores(updates: Partial<Record<ScoreColumn, number>>): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Save scores failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, `Save scores failed for [${Object.keys(updates).join(", ")}]`);
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
export async function recordDailyActivity(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Record daily activity failed: not authenticated.");

  const current = await fetchProfile();
  if (!current) throw new Error("Record daily activity failed: profile not found.");

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

// Add `delta` to a rating but never exceed RATING_MAX, otherwise the next fetch's
// sanitizeRating guard would treat the >1000 value as invalid and reset it to 0.
const addClamped = (current: number | null | undefined, delta: number) =>
  Math.min(RATING_MAX, (current ?? 0) + delta);

/** Adds `delta` points to every cognitive score column of the active user. */
export async function addPointsToActiveUser(delta: number): Promise<Profile> {
  const p = await fetchProfile();
  if (!p) throw new Error("Add points failed: active profile not found.");
  return saveScores({
    algebraic_logic_score: addClamped(p.algebraic_logic_score, delta),
    memory_score: addClamped(p.memory_score, delta),
    speed_score: addClamped(p.speed_score, delta),
    focus_score: addClamped(p.focus_score, delta),
    cfop_spatial_record: addClamped(p.cfop_spatial_record, delta),
  });
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
  return data as Profile;
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

/** Add `delta` to all score columns of any user. */
export async function adminAddPoints(targetId: string, delta: number): Promise<Profile> {
  const target = await adminFetchUser(targetId);
  const { data, error } = await getSupabase()
    .from("profiles")
    .update({
      algebraic_logic_score: addClamped(target.algebraic_logic_score, delta),
      memory_score:  addClamped(target.memory_score,  delta),
      speed_score:   addClamped(target.speed_score,   delta),
      focus_score:   addClamped(target.focus_score,   delta),
      cfop_spatial_record: addClamped(target.cfop_spatial_record, delta),
    })
    .eq("id", targetId)
    .select(PROFILE_COLS)
    .single();
  if (error) throw new Error(describeError(error, "adminAddPoints"));
  return sanitizeProfile(data as Profile);
}

/** Reset all scores + streak of any user to 0 (all 5 axes forcefully zeroed). */
export async function adminResetScores(targetId: string): Promise<Profile> {
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
       total_xp: 0,
      last_active_date: null,
    })
    .eq("id", targetId)
    .select(PROFILE_COLS)
    .single();
  if (error) throw new Error(describeError(error, "adminResetScores"));
  return data as Profile;
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
 * Deletes the active user's profile row and clears the local session. RLS must
 * permit users to delete their own row (auth.uid() = id). The underlying auth
 * user is not removed (that requires the service role); clearing the session
 * makes the account inaccessible from this client.
 */
export async function deleteActiveUserAccount(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Delete account failed: not authenticated.");

  const { error } = await getSupabase().from("profiles").delete().eq("id", userId);
  if (error) {
    const msg = describeError(error, "Delete account failed");
    console.error(msg);
    throw new Error(msg);
  }

  await getSupabase().auth.signOut();
  try {
    // Belt-and-suspenders: drop any lingering supabase auth token.
    Object.keys(globalThis.localStorage ?? {})
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => globalThis.localStorage.removeItem(k));
  } catch {
    /* localStorage may be unavailable — signOut already handled the session */
  }
}
// ─── XP awarding (server-side, tamper-resistant) ──────────────────────────────

export type XpAwardResult = {
  totalXp: number;
  xpAwarded: number;
  level: number;
  leveledUp: boolean;
};

export async function awardXp(
  game: string,
  roundScore: number,
): Promise<XpAwardResult | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`${BASE}/award-xp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ game, roundScore }),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error("Award XP failed:", body.error);
    return null;
  }

  return body as XpAwardResult;
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
  // The ranking key (average of 5 axes) is computed, not a stored column, so we
  // pull a generous candidate set and sort by the Global Cognitive Index in JS.
  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .limit(200);

  if (error) {
    const msg = describeError(error, "Fetch leaderboard failed");
    console.error(msg);
    throw new Error(msg);
  }
  return ((data ?? []) as Profile[])
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
  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .limit(1000);

  if (error) {
    // Non-fatal: fall back to the seed distribution so the dashboard still renders.
    console.error(describeError(error, "Fetch population stats failed"));
    return DEFAULT_POPULATION;
  }

  const indices = ((data ?? []) as Profile[])
    .map(hydrateProfile)
   .filter(
  (p) =>
    (p.schulte_sessions ?? 0) +
      (p.sudoku_sessions ?? 0) +
      (p.stroop_sessions ?? 0) +
      (p.reaction_sessions ?? 0) >=
    5,
)
    .map(cognitiveIndex);

  if (indices.length < MIN_POPULATION) return { ...DEFAULT_POPULATION, n: indices.length };

  const mean = indices.reduce((s, x) => s + x, 0) / indices.length;
  const variance = indices.reduce((s, x) => s + (x - mean) ** 2, 0) / (indices.length - 1);
  const sd = Math.sqrt(variance);

  // A degenerate spread (everyone identical) would make every z-score infinite.
  return { mean, sd: sd > 1 ? sd : DEFAULT_POPULATION.sd, n: indices.length };
}