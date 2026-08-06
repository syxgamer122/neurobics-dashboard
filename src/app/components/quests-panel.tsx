import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Gift, Target } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import { claimQuest, fetchDailyQuests, type DailyQuest } from "../lib/api";
import { logError } from "../lib/logger";

// Tiến độ do Postgres tính từ training_sessions theo giờ Việt Nam.
// 3 daily xoay mỗi ngày + 3 weekly; client chỉ hiển thị và xin nhận thưởng.

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(16,185,129,0.16)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

const QUEST_TXT: Record<string, { vi: string; en: string }> = {
  q_rounds_3: { vi: "Khởi động: chơi 3 ván", en: "Warm up: play 3 rounds" },
  q_rounds_5: { vi: "Chơi 5 ván hôm nay", en: "Play 5 rounds today" },
  q_rounds_7: { vi: "Bền bỉ: chơi 7 ván", en: "Endurance: play 7 rounds" },
  q_score_600: { vi: "Đạt 600+ trong một ván", en: "Score 600+ in one round" },
  q_score_750_2: { vi: "Đạt 750+ trong 2 ván", en: "Score 750+ in 2 rounds" },
  q_score_850: { vi: "Đạt 850+ trong một ván", en: "Score 850+ in one round" },
  q_games_2: { vi: "Chơi 2 trò khác nhau", en: "Play 2 different games" },
  q_games_3: { vi: "Chơi 3 trò khác nhau", en: "Play 3 different games" },
  q_games_4: { vi: "Chơi 4 trò khác nhau", en: "Play 4 different games" },
  q_play_schulte_2: { vi: "Chơi Schulte 2 ván", en: "Play 2 Schulte rounds" },
  q_play_sudoku_2: { vi: "Chơi Sudoku 2 ván", en: "Play 2 Sudoku rounds" },
  q_play_stroop_2: { vi: "Chơi Stroop 2 ván", en: "Play 2 Stroop rounds" },
  q_play_reaction_2: {
    vi: "Chơi Reaction 2 ván",
    en: "Play 2 Reaction rounds",
  },
  q_play_memory_2: { vi: "Chơi Memory 2 ván", en: "Play 2 Memory rounds" },
  q_play_nback_2: { vi: "Chơi N-Back 2 ván", en: "Play 2 N-Back rounds" },
  q_play_math_2: {
    vi: "Chơi Math Sprint 2 ván",
    en: "Play 2 Math Sprint rounds",
  },
  q_play_gonogo_2: {
    vi: "Chơi Go / No-Go 2 ván",
    en: "Play 2 Go / No-Go rounds",
  },
  q_play_mental_2: {
    vi: "Chơi Mental Rotation 2 ván",
    en: "Play 2 Mental Rotation rounds",
  },
  w_rounds_25: {
    vi: "Tuần: hoàn thành 25 ván",
    en: "Weekly: finish 25 rounds",
  },
  w_games_7: {
    vi: "Tuần: chơi 7 trò khác nhau",
    en: "Weekly: play 7 different games",
  },
  w_score_800_5: { vi: "Tuần: 5 ván đạt 800+", en: "Weekly: 5 rounds at 800+" },
  w_score_900_3: {
    vi: "Tuần elite: 3 ván đạt 900+",
    en: "Elite week: 3 rounds at 900+",
  },
};

// Tên game dùng cho nhãn dự phòng. Giữ tại chỗ để panel không bao giờ vỡ
// nếu Postgres phát một mã nhiệm vụ mới trước khi bản dịch kịp lên.
const QUEST_GAME_NAMES: Record<string, string> = {
  schulte: "Schulte",
  sudoku: "Sudoku",
  stroop: "Stroop",
  reaction: "Reaction",
  memory: "Memory",
  nback: "N-Back",
  math: "Math Sprint",
  gonogo: "Go / No-Go",
  mental: "Mental Rotation",
};

/**
 * Nhãn dự phòng khi một mã nhiệm vụ chưa có trong QUEST_TXT.
 * Trước đây fallback là chính mã thô, nên người chơi nhìn thấy "q_rounds_5"
 * hay "w_games_7" ngay trên giao diện. Hàm này dịch mã thành câu đọc được
 * từ chính cấu trúc mã, nên UI vẫn tử tế với mọi nhiệm vụ thêm sau này.
 */
// Khong export: chi dung o dong ~166 trong chinh file nay, va de `export` thi
// Fast Refresh phai reload ca trang moi lan sua QuestsPanel.
//
// CANH BAO NO KY THUAT: ham nay TRUNG TEN va trung muc dich voi
// `humanizeQuestCode` trong `src/app/lib/quest-labels.ts` (ban o do moi la ban
// duoc test boi tests/quest-labels.test.ts). Hai ban co the da lech nhau. Chua
// gop lam mot o day vi gop la doi hanh vi hien thi, phai doi chieu tung mau
// truoc — xem ghi chu cuoi phien.
function humanizeQuestCode(code: string, lang: "vi" | "en"): string {
  const weekly = code.startsWith("w_");
  const body = code.replace(/^[qw]_/, "");
  const prefix = weekly ? (lang === "vi" ? "Tuần: " : "Weekly: ") : "";

  let text: string | null = null;
  let m: RegExpMatchArray | null;

  if ((m = body.match(/^rounds_(\d+)$/))) {
    text = lang === "vi" ? `chơi ${m[1]} ván` : `play ${m[1]} rounds`;
  } else if ((m = body.match(/^score_(\d+)_(\d+)$/))) {
    text =
      lang === "vi"
        ? `đạt ${m[1]}+ trong ${m[2]} ván`
        : `score ${m[1]}+ in ${m[2]} rounds`;
  } else if ((m = body.match(/^score_(\d+)$/))) {
    text =
      lang === "vi"
        ? `đạt ${m[1]}+ trong một ván`
        : `score ${m[1]}+ in one round`;
  } else if ((m = body.match(/^games_(\d+)$/))) {
    text =
      lang === "vi"
        ? `chơi ${m[1]} trò khác nhau`
        : `play ${m[1]} different games`;
  } else if ((m = body.match(/^play_([a-z]+)_(\d+)$/))) {
    const game = QUEST_GAME_NAMES[m[1]] ?? m[1];
    text =
      lang === "vi"
        ? `chơi ${game} ${m[2]} ván`
        : `play ${m[2]} ${game} rounds`;
  }

  if (!text) {
    // Mã hoàn toàn lạ: ít nhất cũng bỏ gạch dưới thay vì phơi mã kỹ thuật.
    text = body.replace(/_/g, " ");
  }

  const label = prefix + text;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

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
  const label =
    QUEST_TXT[quest.code]?.[lang] ?? humanizeQuestCode(quest.code, lang);

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: quest.claimed
          ? "rgba(16,185,129,0.08)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${
          ready
            ? "rgba(16,185,129,0.5)"
            : quest.claimed
              ? "rgba(16,185,129,0.25)"
              : "rgba(255,255,255,0.07)"
        }`,
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs text-white/85">{label}</span>
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
              background: "rgba(16,185,129,0.15)",
              border: "1px solid rgba(16,185,129,0.45)",
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
      toast.success(s.got(res.xpAwarded));
      await load();
      onClaimed?.();
    } catch (err) {
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
          <span className="text-xs tracking-[0.25em] uppercase text-white font-mono">
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
      <p className="text-xs text-white/40 mb-4">{s.sub}</p>

      {quests === null ? (
        <div className="text-xs text-white/40 py-6 text-center">
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
