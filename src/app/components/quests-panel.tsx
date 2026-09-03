import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Gift, Target } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import { claimQuest, fetchDailyQuests, type DailyQuest } from "../lib/api";
import { logError } from "../lib/logger";
import { resolveQuestLabel } from "../lib/quest-labels";

// Tiến độ do Postgres tính từ training_sessions theo giờ Việt Nam.
// 3 daily xoay mỗi ngày + 3 weekly; client chỉ hiển thị và xin nhận thưởng.

const panelStyle: React.CSSProperties = {
  background: "rgba(var(--neuro-ink-rgb),0.55)",
  border: "1px solid rgba(var(--neuro-green-rgb),0.16)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

const TXT = {
  vi: {
    title: "NHIỆM VỤ",
    sub: "Nhiệm vụ ngày làm mới 00:00 · nhiệm vụ tuần làm mới thứ Hai (GMT+7)",
    daily: "HÔM NAY",
    weekly: "TUẦN NÀY",
    claim: "NHẬN",
    claimed: "ĐÃ NHẬN",
    done: "đã nhận",
    loading: "Đang tải…",
    got: (xp: number) => `Đã nhận +${xp} XP`,
  },
  en: {
    title: "QUESTS",
    sub: "Daily resets at 00:00 · weekly resets Monday (GMT+7)",
    daily: "TODAY",
    weekly: "THIS WEEK",
    claim: "CLAIM",
    claimed: "CLAIMED",
    done: "claimed",
    loading: "Loading…",
    got: (xp: number) => `Claimed +${xp} XP`,
  },
};

function QuestRow({
  quest,
  lang,
  busy,
  onClaim,
}: {
  quest: DailyQuest;
  lang: "vi" | "en";
  busy: string | null;
  onClaim: (code: string) => void;
}) {
  const s = TXT[lang];
  const pct = Math.min(100, (quest.progress / Math.max(1, quest.goal)) * 100);
  const ready = quest.progress >= quest.goal && !quest.claimed;
  // Mot nguon duy nhat cho nhan nhiem vu: resolveQuestLabel tra cuu
  // QUEST_LABELS roi moi humanize, dung thu tu ma lib da dinh nghia va
  // tests/quest-labels.test.ts da khoa. Truoc day panel giu ban sao rieng
  // cua ca bang nhan lan ham humanize; ban sao do lech 50/250 phep thu:
  // thieu corsi + trail nen hien id tho, tra chuoi rong voi ma "q_", va
  // NEM TypeError neu RPC tra code null.
  // Uu tien 1: nhan do server viet (title_vi/title_en tu migration 20260828)
  // — doi ten nhiem vu trong database la giao dien doi theo, khoi build lai.
  // Thu tu day du (server -> QUEST_LABELS -> humanize -> "Nhiem vu") da duoc
  // tests/quest-labels.test.ts khoa san (xem nhom "thu tu uu tien").
  const label = resolveQuestLabel(
    quest.code,
    lang,
    lang === "vi" ? quest.title_vi : quest.title_en,
  );

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: quest.claimed
          ? "rgba(var(--neuro-green-rgb),0.08)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${
          ready
            ? "rgba(var(--neuro-green-rgb),0.5)"
            : quest.claimed
              ? "rgba(var(--neuro-green-rgb),0.25)"
              : "rgba(255,255,255,0.07)"
        }`,
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs text-foreground/85">{label}</span>
        <span className="text-xs shrink-0" style={{ color: "#F59E0B" }}>
          +{quest.xp_reward} XP
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
              background: "linear-gradient(90deg,#10B981,#00D4FF)",
            }}
          />
        </div>
        <span
          className="text-xs w-14 text-right"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {quest.progress}/{quest.goal}
        </span>
        {quest.claimed ? (
          <span
            className="text-xs flex items-center gap-1 w-20 justify-end"
            style={{ color: "#10B981" }}
          >
            <CheckCircle2 size={11} /> {s.claimed}
          </span>
        ) : (
          <button
            type="button"
            disabled={!ready || busy === quest.code}
            onClick={() => onClaim(quest.code)}
            className="text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1 w-20 justify-center transition-all"
            style={{
              opacity: ready ? 1 : 0.35,
              cursor: ready ? "pointer" : "not-allowed",
              background: "rgba(var(--neuro-green-rgb),0.15)",
              border: "1px solid rgba(var(--neuro-green-rgb),0.45)",
              color: "#10B981",
            }}
          >
            <Gift size={11} /> {s.claim}
          </button>
        )}
      </div>
    </div>
  );
}

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
      logError("Fetch quests failed:", err);
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
      if (res.alreadyClaimed) {
        toast.info(s.claimed);
      } else {
        toast.success(s.got(res.xpAwarded));
      }
      await load();
      onClaimed?.();
    } catch (err) {
      logError("Claim quest failed:", err);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const daily = (quests ?? []).filter((q) => !q.code.startsWith("w_"));
  const weekly = (quests ?? []).filter((q) => q.code.startsWith("w_"));
  const completed = (quests ?? []).filter((q) => q.claimed).length;

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: "#10B981" }} />
          <span className="text-xs tracking-[0.25em] uppercase text-foreground font-mono">
            {s.title}
          </span>
        </div>
        <span
          className="text-xs whitespace-nowrap"
          style={{ color: "#10B981" }}
        >
          {completed}/{(quests ?? []).length} {s.done}
        </span>
      </div>
      <p className="text-xs text-foreground/40 mb-4">{s.sub}</p>

      {quests === null ? (
        <div className="text-xs text-foreground/40 py-6 text-center">
          {s.loading}
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <div className="flex items-center gap-2 mb-2 text-xs tracking-[0.18em] text-emerald-400/80 font-mono">
              <Target size={12} /> {s.daily}
            </div>
            <div className="space-y-2.5">
              {daily.map((q) => (
                <QuestRow
                  key={q.code}
                  quest={q}
                  lang={lang}
                  busy={busy}
                  onClaim={claim}
                />
              ))}
            </div>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-2 text-xs tracking-[0.18em] text-cyan-400/80 font-mono">
              <CalendarDays size={12} /> {s.weekly}
            </div>
            <div className="space-y-2.5">
              {weekly.map((q) => (
                <QuestRow
                  key={q.code}
                  quest={q}
                  lang={lang}
                  busy={busy}
                  onClaim={claim}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
