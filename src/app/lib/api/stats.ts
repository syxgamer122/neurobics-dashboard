/**
 * Aggregates: cognitive index, axis coverage, leaderboard, population
 * statistics and activity counters.
 */
import {
  MIN_POPULATION,
  DEFAULT_POPULATION,
  type PopulationStats,
} from "../scoring";
import { totalSessions } from "../sessions";
import {
  getSupabase,
  MIGRATION_HINT,
  describeError,
  LEADERBOARD_COLS,
  hydrateProfile,
  currentUserId,
  vnDayStartUtc,
  vnMonthStartUtc,
  type Profile,
} from "./internal";
import { logError, logWarn } from "../logger";

/**
 * Global Cognitive Index = trung binh cac truc DA CO du lieu (0–1000).
 *
 * Truoc day chia cung cho 5 ke ca truc chua bao gio choi, nen nguoi chi choi
 * Sudoku bi keo index xuong ~1/5 va brain age gia di rat nhieu. Gio chi tinh
 * tren truc > 0; UI hien so truc da mo qua axesCovered().
 */
export function cognitiveIndex(p: Profile): number {
  const axes = [
    p.algebraic_logic_score,
    p.focus_score,
    p.speed_score,
    p.memory_score,
    p.cfop_spatial_record,
  ].map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));

  const active = axes.filter((v) => v > 0);
  if (active.length === 0) return 0;
  const raw = active.reduce((a, b) => a + b, 0) / active.length;
  // Shrinkage theo do phu: chia cung cho 5 thi phat oan nguoi moi, con trung
  // binh tren rieng truc da mo thi nghieng nguoc lai — cang choi IT game cang
  // de giu index cao (Logic 800 mot truc dung tren nguoi du 5 truc trung binh
  // 700). He so keo index ve theo so truc da mo, day du 5 truc moi duoc 100%.
  return raw * (COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) * (active.length / 5));
}

/** Ty le index giu lai khi chi mo dung 1 truc (0.4 => phat 60% + shrinkage). */
export const COVERAGE_FLOOR = 0.4;

/** So truc da co du lieu (0–5) — dung de canh bao ho so chua day du. */
export function axesCovered(p: Profile): number {
  return [
    p.algebraic_logic_score,
    p.focus_score,
    p.speed_score,
    p.memory_score,
    p.cfop_spatial_record,
  ].filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0).length;
}

/**
 * Bao hieu du lieu dang o nhanh fallback (chi doc duoc mot phan nguoi choi).
 * UI doc ngay sau await de hien badge "du lieu mot phan" thay vi hien so sai
 * mot cach im lang.
 */
export type DataQuality = { partial: boolean; scanned: number };

export const LEADERBOARD_FALLBACK_LIMIT = 200;
export const POPULATION_FALLBACK_LIMIT = 1000;

export const dataQuality: {
  leaderboard: DataQuality;
  population: DataQuality;
} = {
  leaderboard: { partial: false, scanned: 0 },
  population: { partial: false, scanned: 0 },
};

export async function fetchLeaderboard(): Promise<Profile[]> {
  // Prefer the Postgres RPC (ordered by generated cognitive_index). Fall back
  // to a client-side sort only if the migration has not been applied yet.
  const { data, error } = await getSupabase().rpc("get_leaderboard", {
    p_limit: 25,
  });

  // Luon hydrate (decay) roi SORT LAI theo diem hien thi — RPC co the
  // sap theo cognitive_index thô trong DB neu migration decay chua chay.
  dataQuality.leaderboard = { partial: false, scanned: 0 };

  const rows = !error
    ? ((data ?? []) as Profile[])
    : await (async () => {
        logWarn(
          "[neurobics] get_leaderboard RPC unavailable — using the client-side",
          "fallback (fetches up to 200 rows and sorts in the browser).",
          MIGRATION_HINT,
          error.message,
        );
        const fb = await getSupabase()
          .from("profiles")
          .select(LEADERBOARD_COLS)
          .limit(LEADERBOARD_FALLBACK_LIMIT);
        if (fb.error) {
          throw new Error(describeError(fb.error, "Fetch leaderboard failed"));
        }
        const scanned = (fb.data ?? []).length;
        // Doc du gioi han => rat co the con nguoi choi chua duoc quet, top that
        // co the vang mat. Danh dau de UI noi ro thay vi hien bang sai im lang.
        dataQuality.leaderboard = {
          partial: scanned >= LEADERBOARD_FALLBACK_LIMIT,
          scanned,
        };
        return (fb.data ?? []) as Profile[];
      })();

  return rows
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

  dataQuality.population = { partial: false, scanned: 0 };

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const n = Number(row?.n ?? 0);
    if (n < MIN_POPULATION) return { ...DEFAULT_POPULATION, n };
    const mean = Number(row?.mean ?? DEFAULT_POPULATION.mean);
    const sd = Number(row?.sd ?? 0);
    return { mean, sd: sd > 1 ? sd : DEFAULT_POPULATION.sd, n };
  }

  logWarn(
    "[neurobics] get_population_stats RPC unavailable — using the client-side",
    "fallback (fetches up to 1000 rows and aggregates in the browser).",
    MIGRATION_HINT,
    error.message,
  );

  const fb = await getSupabase()
    .from("profiles")
    .select(LEADERBOARD_COLS)
    .limit(POPULATION_FALLBACK_LIMIT);

  dataQuality.population = {
    partial: (fb.data ?? []).length >= POPULATION_FALLBACK_LIMIT,
    scanned: (fb.data ?? []).length,
  };

  if (fb.error) {
    logError(describeError(fb.error, "Fetch population stats failed"));
    return DEFAULT_POPULATION;
  }

  const indices = ((fb.data ?? []) as Profile[])
    .map(hydrateProfile)
    .filter((p) => totalSessions(p) >= 5)
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

  logWarn(
    "get_activity_stats RPC unavailable, falling back to client aggregate:",
    error.message,
  );

  const now = new Date();
  const dayStart = vnDayStartUtc(now);
  const monthStart = vnMonthStartUtc(now);

  const xpFb = await getSupabase()
    .from("xp_events")
    .select("xp_awarded, created_at, game")
    .eq("user_id", userId)
    .gte("created_at", dayStart.toISOString());

  if (xpFb.error)
    throw new Error(`Fetch activity stats failed: ${xpFb.error.message}`);

  let xpToday = 0;
  for (const row of xpFb.data ?? []) {
    xpToday += row.xp_awarded ?? 0;
  }

  // Dem phien choi that tu training_sessions — khong gom quest/achievement XP.
  const sessFb = await getSupabase()
    .from("training_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  if (sessFb.error)
    throw new Error(`Fetch session count failed: ${sessFb.error.message}`);

  return {
    xpToday,
    sessionsThisMonth: sessFb.count ?? 0,
  };
}
