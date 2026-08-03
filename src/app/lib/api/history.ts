/**
 * Past performance: training history, personal bests and progress series.
 */
import {
  getSupabase,
  currentUserId,
  numOrNull,
} from "./internal";
import { type RoundGame } from "./rounds";

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

/** Ky luc Schulte tach theo size (3-6) x mode (classic|reverse|dual). */
export type SchulteConfigBest = {
  grid_size: 3 | 4 | 5 | 6;
  mode: "classic" | "reverse" | "dual";
  best_time_ms: number | null;
  best_score: number | null;
  rounds: number;
  last_played_at: string;
};

export type SchulteBestKey = `${SchulteConfigBest["grid_size"]}_${SchulteConfigBest["mode"]}`;

export function schulteBestMapKey(
  size: SchulteConfigBest["grid_size"],
  mode: SchulteConfigBest["mode"],
): SchulteBestKey {
  return `${size}_${mode}`;
}

/**
 * Doc ky luc Schulte theo tung cau hinh tu Postgres (auth.uid()).
 * Can migration 20260822_schulte_config_bests.sql.
 */
export async function fetchSchulteConfigBests(): Promise<SchulteConfigBest[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_schulte_config_bests");
  if (error) {
    throw new Error(`Fetch Schulte config bests failed: ${error.message}`);
  }

  const allowedSize = new Set([3, 4, 5, 6]);
  const allowedMode = new Set(["classic", "reverse", "dual"]);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: SchulteConfigBest[] = [];

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const grid = Number(row.grid_size);
    const mode = String(row.mode ?? "").toLowerCase();
    if (!allowedSize.has(grid) || !allowedMode.has(mode)) continue;

    const bestTimeNum = Number(row.best_time_ms);
    const bestScoreNum = Number(row.best_score);
    out.push({
      grid_size: grid as 3 | 4 | 5 | 6,
      mode: mode as "classic" | "reverse" | "dual",
      best_time_ms:
        Number.isFinite(bestTimeNum) && bestTimeNum > 0 ? bestTimeNum : null,
      best_score: Number.isFinite(bestScoreNum) ? bestScoreNum : null,
      rounds: Number(row.rounds ?? 0),
      last_played_at: String(row.last_played_at ?? ""),
    });
  }

  return out;
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
