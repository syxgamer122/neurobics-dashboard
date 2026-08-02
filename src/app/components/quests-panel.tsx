import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gift, Target } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import { claimQuest, fetchDailyQuests, type DailyQuest } from "../lib/api";

// ─── Nhiệm vụ ngày ────────────────────────────────────────────────────
// Tiến độ do Postgres tính từ training_sessions trong ngày (giờ Việt Nam),
// nên không thể tự khai báo hoàn thành từ trình duyệt.

const mono: React.CSSProperties = {
  
};

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(16,185,129,0.16)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

const QUEST_TXT: Record<string, { vi: string; en: string }> = {
  q_rounds_3: { vi: "Chơi 3 ván hôm nay", en: "Play 3 rounds today" },
  q_score_600: { vi: "Đạt 600+ trong một ván", en: "Score 600+ in one round" },
  q_two_games: { vi: "Chơi 2 trò khác nhau", en: "Play 2 different games" },
  q_xp_60: { vi: "Kiếm 60 XP trong ngày", en: "Earn 60 XP today" },
};

const TXT = {
  vi: {
    title: "NHIỆM VỤ HÔM NAY",
    sub: "Làm mới mỗi ngày lúc 00:00 giờ Việt Nam",
    claim: "NHẬN",
    claimed: "ĐÃ NHẬN",
    done: "nhiệm vụ hoàn thành",
    loading: "Đang tải…",
    got: (xp: number) => `Đã nhận +${xp} XP`,
  },
  en: {
    title: "DAILY QUESTS",
    sub: "Resets at midnight, Vietnam time",
    claim: "CLAIM",
    claimed: "CLAIMED",
    done: "quests done",
    loading: "Loading…",
    got: (xp: number) => `Claimed +${xp} XP`,
  },
};

export function QuestsPanel({
  refreshKey = 0,
  onClaimed,
}: {
  refreshKey?: number;
  onClaimed?: () => void;
}) {
  const { lang } = useLang();
  const s = TXT[lang];
  const [quests, setQuests] = useState<DailyQuest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQuests(await fetchDailyQuests());
    } catch (err) {
      console.error("Fetch daily quests failed:", err);
      setQuests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const claim = async (code: string) => {
    setBusy(code);
    try {
      const res = await claimQuest(code);
      toast.success(s.got(res.xpAwarded));
      await load();
      onClaimed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const completed = (quests ?? []).filter((q) => q.claimed).length;

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: "#10B981" }} />
          <span
            className="text-xs tracking-[0.25em] uppercase text-white font-mono"
          >
            {s.title}
          </span>
        </div>
        <span className="text-xs" style={{ color: "#10B981" }}>
          {completed}/{(quests ?? []).length} {s.done}
        </span>
      </div>
      <p className="text-xs text-white/40 mb-4">
        {s.sub}
      </p>

      {quests === null ? (
        <div className="text-xs text-white/40 py-6 text-center">
          {s.loading}
        </div>
      ) : (
        <div className="space-y-2.5">
          {quests.map((q) => {
            const pct = Math.min(100, (q.progress / Math.max(1, q.goal)) * 100);
            const ready = q.progress >= q.goal && !q.claimed;
            const label = QUEST_TXT[q.code]?.[lang] ?? q.code;
            return (
              <div
                key={q.code}
                className="rounded-xl p-3"
                style={{
                  background: q.claimed
                    ? "rgba(16,185,129,0.08)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    ready
                      ? "rgba(16,185,129,0.5)"
                      : q.claimed
                        ? "rgba(16,185,129,0.25)"
                        : "rgba(255,255,255,0.07)"
                  }`}}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs text-white/85">{label}</span>
                  <span
                    className="text-xs shrink-0"
                    style={{ color: "#F59E0B" }}
                  >
                    +{q.xp_reward} XP
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg,#10B981,#00D4FF)"}}
                    />
                  </div>
                  <span
                    className="text-xs w-12 text-right"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    {q.progress}/{q.goal}
                  </span>

                  {q.claimed ? (
                    <span
                      className="text-xs flex items-center gap-1 w-20 justify-end"
                      style={{ color: "#10B981" }}
                    >
                      <CheckCircle2 size={11} /> {s.claimed}
                    </span>
                  ) : (
                    <button
                      disabled={!ready || busy === q.code}
                      onClick={() => claim(q.code)}
                      className="text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1 w-20 justify-center transition-all"
                      style={{
                        opacity: ready ? 1 : 0.35,
                        cursor: ready ? "pointer" : "not-allowed",
                        background: "rgba(16,185,129,0.15)",
                        border: "1px solid rgba(16,185,129,0.45)",
                        color: "#10B981"}}
                    >
                      <Gift size={11} /> {s.claim}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
