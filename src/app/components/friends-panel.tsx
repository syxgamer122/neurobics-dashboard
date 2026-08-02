import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import {
  fetchFriendLeaderboard,
  fetchFriends,
  removeFriend,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest,
  type FriendEntry,
  type FriendRank,
  type PlayerSearchResult,
} from "../lib/api";
import { logError } from "../lib/logger";

// ─── Bạn bè + bảng xếp hạng riêng ───────────────────────────────────────
// Mọi thao tác đi qua RPC security definer: chỉ người được mời mới chấp nhận
// được lời mời, và bảng xếp hạng chỉ trả về những người đã kết bạn.

const mono: React.CSSProperties = {
  
};

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(0,212,255,0.16)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

const TXT = {
  vi: {
    title: "BẠN BÈ",
    sub: "So kè chỉ số nhận thức với bạn bè của bạn",
    searchPh: "Tìm theo tên người dùng…",
    add: "Kết bạn",
    incoming: "Lời mời đến",
    outgoing: "Đang chờ phản hồi",
    friends: "Bạn bè",
    ranking: "XếP HẠNG RIÊNG",
    empty: "Chưa có bạn nào. Tìm tên ở trên để kết bạn.",
    noResult: "Không tìm thấy người chơi nào.",
    sent: "Đã gửi lời mời",
    accepted: "Đã kết bạn",
    declined: "Đã từ chối",
    removed: "Đã huỷ kết bạn",
    loading: "Đang tải…",
    ci: "CI",
    you: "Bạn",
  },
  en: {
    title: "FRIENDS",
    sub: "Compare your cognitive index with friends",
    searchPh: "Search by username…",
    add: "Add",
    incoming: "Incoming requests",
    outgoing: "Pending",
    friends: "Friends",
    ranking: "PRIVATE RANKING",
    empty: "No friends yet. Search above to add someone.",
    noResult: "No players found.",
    sent: "Request sent",
    accepted: "Friend added",
    declined: "Request declined",
    removed: "Friend removed",
    loading: "Loading…",
    ci: "CI",
    you: "You",
  },
};

const Avatar = ({
  url,
  name,
  size = 28,
}: {
  url: string | null;
  name: string;
  size?: number;
}) =>
  url ? (
    <img
      src={url}
      alt={name}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-xs text-white/70"
      style={{
        width: size,
        height: size,
        background: "rgba(0,212,255,0.14)",
        border: "1px solid rgba(0,212,255,0.3)",
        ...mono}}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );

export function FriendsPanel() {
  const { lang } = useLang();
  const s = TXT[lang];

  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [board, setBoard] = useState<FriendRank[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, ranks] = await Promise.all([
        fetchFriends(),
        fetchFriendLeaderboard(),
      ]);
      setFriends(list);
      setBoard(ranks);
    } catch (err) {
      logError("Load friends failed:", err);
      setFriends([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Tìm kiếm có độ trễ để không bắn RPC theo từng phím gõ.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      searchPlayers(q)
        .then(setResults)
        .catch((err) => {
          logError("Search players failed:", err);
          setResults([]);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setQuery("");
      setResults(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const incoming = (friends ?? []).filter((f) => f.direction === "incoming");
  const outgoing = (friends ?? []).filter((f) => f.direction === "outgoing");
  const accepted = (friends ?? []).filter((f) => f.direction === "friend");

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center gap-2 mb-1">
        <Users size={16} style={{ color: "#00D4FF" }} />
        <span
          className="text-xs tracking-[0.25em] uppercase text-white font-mono"
        >
          {s.title}
        </span>
      </div>
      <p className="text-xs text-white/40 mb-4">
        {s.sub}
      </p>

      {/* Tìm người chơi */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)"}}
      >
        <Search size={13} className="text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={s.searchPh}
          className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-white/30"
        />
      </div>

      {results !== null && (
        <div className="space-y-1.5 mb-4">
          {results.length === 0 ? (
            <div className="text-xs text-white/35 py-2">
              {s.noResult}
            </div>
          ) : (
            results.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <Avatar url={p.avatar_url} name={p.username} />
                <span className="flex-1 text-xs text-white/85 truncate">
                  {p.username}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  {s.ci} {Math.round(p.cognitive_index)}
                </span>
                <button
                  disabled={busy}
                  onClick={() => act(() => sendFriendRequest(p.id), s.sent)}
                  className="text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1"
                  style={{
                    background: "rgba(0,212,255,0.13)",
                    border: "1px solid rgba(0,212,255,0.4)",
                    color: "#00D4FF"}}
                >
                  <UserPlus size={11} /> {s.add}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Lời mời đến */}
      {incoming.length > 0 && (
        <div className="mb-4">
          <div
            className="text-xs tracking-widest uppercase text-white/35 mb-1.5 font-mono"
          >
            {s.incoming}
          </div>
          <div className="space-y-1.5">
            {incoming.map((f) => (
              <div
                key={f.friendship_id}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={{
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)"}}
              >
                <Avatar url={f.avatar_url} name={f.username} />
                <span className="flex-1 text-xs text-white/85 truncate">
                  {f.username}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => respondFriendRequest(f.friendship_id, true),
                      s.accepted,
                    )
                  }
                  className="p-1.5 rounded-lg"
                  style={{
                    background: "rgba(16,185,129,0.15)",
                    border: "1px solid rgba(16,185,129,0.4)",
                    color: "#10B981"}}
                >
                  <Check size={12} />
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => respondFriendRequest(f.friendship_id, false),
                      s.declined,
                    )
                  }
                  className="p-1.5 rounded-lg"
                  style={{
                    background: "rgba(244,63,94,0.12)",
                    border: "1px solid rgba(244,63,94,0.35)",
                    color: "#F43F5E"}}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Đang chờ phản hồi */}
      {outgoing.length > 0 && (
        <div className="mb-4">
          <div
            className="text-xs tracking-widest uppercase text-white/35 mb-1.5 font-mono"
          >
            {s.outgoing}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {outgoing.map((f) => (
              <span
                key={f.friendship_id}
                className="text-xs px-2.5 py-1 rounded-lg text-white/50"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)"}}
              >
                {f.username}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bảng xếp hạng riêng */}
      <div
        className="text-xs tracking-widest uppercase text-white/35 mb-1.5 font-mono"
      >
        {s.ranking}
      </div>

      {friends === null ? (
        <div className="text-xs text-white/40 py-4 text-center">
          {s.loading}
        </div>
      ) : accepted.length === 0 ? (
        <div className="text-xs text-white/35 py-3">
          {s.empty}
        </div>
      ) : (
        <div className="space-y-1.5">
          {board.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2"
              style={{
                background: r.is_me
                  ? "rgba(0,212,255,0.1)"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${
                  r.is_me ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.06)"
                }`}}
            >
              <span
                className="text-xs w-5 shrink-0"
                style={{
                  color: i === 0 ? "#F59E0B" : "rgba(255,255,255,0.35)"}}
              >
                {i === 0 ? <Crown size={12} /> : `#${i + 1}`}
              </span>
              <Avatar url={r.avatar_url} name={r.username} size={26} />
              <span className="flex-1 text-xs text-white/85 truncate">
                {r.username}
                {r.is_me && (
                  <span className="text-white/35"> · {s.you}</span>
                )}
              </span>
              <span
                className="text-xs"
                style={{ color: "#00D4FF" }}
              >
                {Math.round(r.cognitive_index)}
              </span>
              {!r.is_me && (
                <button
                  disabled={busy}
                  onClick={() => act(() => removeFriend(r.id), s.removed)}
                  className="p-1 rounded-lg text-white/25 hover:text-[#F43F5E] transition-colors"
                  title={s.removed}
                >
                  <UserMinus size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
