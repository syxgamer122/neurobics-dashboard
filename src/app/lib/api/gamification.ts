/**
 * Achievements and daily quests.
 */
import {
  getSupabase,
  currentUserId,
} from "./internal";

// ─── Giai đoạn 5: thành tựu, nhiệm vụ ngày, bạn bè ────────────────────────
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

export type AchievementProgress = {
  code: string;
  progress: number;
  goal: number;
  unlocked: boolean;
};

/**
 * Tiến độ từng thành tựu để vẽ thanh progress.
 * Server tính từ cùng một nguồn thống kê với sync_achievements, nên
 * "progress đạt goal" luôn trùng với "đã mở khoá" sau lần đồng bộ gần nhất.
 */
export async function fetchAchievementProgress(): Promise<
  AchievementProgress[]
> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_achievement_progress");
  if (error) throw new Error(`Fetch achievement progress failed: ${error.message}`);

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: AchievementProgress[] = [];
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const goal = Number(row.goal ?? 1);
    out.push({
      code: String(row.code ?? ""),
      progress: Number(row.progress ?? 0),
      goal: goal > 0 ? goal : 1,
      unlocked: Boolean(row.unlocked),
    });
  }
  return out;
}

export type DailyQuest = {
  code: string;
  progress: number;
  goal: number;
  xp_reward: number;
  claimed: boolean;
  /** Nhãn tiếng Việt từ Postgres (migration 20260828+). Có thể rỗng nếu RPC cũ. */
  title_vi?: string;
  /** Nhãn English từ Postgres (migration 20260828+). Có thể rỗng nếu RPC cũ. */
  title_en?: string;
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
    title_vi: row.title_vi != null ? String(row.title_vi) : undefined,
    title_en: row.title_en != null ? String(row.title_en) : undefined,
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
