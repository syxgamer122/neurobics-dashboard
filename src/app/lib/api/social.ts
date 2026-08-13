/**
 * Player search, friend requests and the friends-only leaderboard.
 */
import { getSupabase, currentUserId } from "./internal";

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
  is_me: boolean;
};

/** Bảng xếp hạng chỉ gồm bạn bè đã chấp nhận và chính mình. */
export async function fetchFriendLeaderboard(): Promise<FriendRank[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_friend_leaderboard");
  if (error)
    throw new Error(`Fetch friend leaderboard failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    username: String(row.username ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    cognitive_index: Number(row.cognitive_index ?? 0),
    total_xp: Number(row.total_xp ?? 0),
    is_me: Boolean(row.is_me),
  }));
}
