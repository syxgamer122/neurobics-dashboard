import { useEffect, useMemo, useState } from "react";
import { Award, Lock } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import { syncAchievements, type AchievementUnlock } from "../lib/api";

// ─── Thành tựu ─────────────────────────────────────────────────────────
// Điều kiện mở khoá và XP thưởng nằm ở Postgres (sync_achievements).
// File này chỉ lo phần hiển thị: tên, mô tả, màu và trạng thái khoá/mở.

type Badge = {
  code: string;
  icon: string;
  accent: string;
  xp: number;
  vi: [string, string];
  en: [string, string];
};

const CATALOG: Badge[] = [
  { code: "first_round", icon: "🌱", accent: "#10B981", xp: 20,
    vi: ["Khởi động", "Hoàn thành ván đầu tiên"],
    en: ["First Spark", "Finish your first round"] },
  { code: "rounds_10", icon: "⚡", accent: "#00D4FF", xp: 30,
    vi: ["Thành thói quen", "Chơi 10 ván"],
    en: ["Warmed Up", "Play 10 rounds"] },
  { code: "rounds_50", icon: "🔥", accent: "#F59E0B", xp: 60,
    vi: ["Bền bỉ", "Chơi 50 ván"],
    en: ["Relentless", "Play 50 rounds"] },
  { code: "rounds_100", icon: "💎", accent: "#A855F7", xp: 100,
    vi: ["Trung thành", "Chơi 100 ván"],
    en: ["Centurion", "Play 100 rounds"] },
  { code: "streak_3", icon: "📅", accent: "#10B981", xp: 30,
    vi: ["Ba ngày liền", "Chuỗi 3 ngày"],
    en: ["Three in a Row", "3-day streak"] },
  { code: "streak_7", icon: "🗓️", accent: "#F59E0B", xp: 60,
    vi: ["Trọn tuần", "Chuỗi 7 ngày"],
    en: ["Full Week", "7-day streak"] },
  { code: "streak_30", icon: "🏆", accent: "#F43F5E", xp: 100,
    vi: ["Thép đã tôi", "Chuỗi 30 ngày"],
    en: ["Iron Will", "30-day streak"] },
  { code: "level_5", icon: "🎚️", accent: "#00D4FF", xp: 40,
    vi: ["Cấp 5", "Đạt cấp 5"],
    en: ["Level 5", "Reach level 5"] },
  { code: "level_10", icon: "🚀", accent: "#A855F7", xp: 70,
    vi: ["Cấp 10", "Đạt cấp 10"],
    en: ["Level 10", "Reach level 10"] },
  { code: "level_20", icon: "🌟", accent: "#F59E0B", xp: 100,
    vi: ["Cấp 20", "Đạt cấp 20"],
    en: ["Level 20", "Reach level 20"] },
  { code: "axis_500", icon: "📈", accent: "#10B981", xp: 50,
    vi: ["Vượt ngưỡng", "Một trục đạt 500"],
    en: ["Breakthrough", "Any axis hits 500"] },
  { code: "axis_800", icon: "🧠", accent: "#F43F5E", xp: 100,
    vi: ["Tinh thông", "Một trục đạt 800"],
    en: ["Mastery", "Any axis hits 800"] },
  { code: "all_games", icon: "🎮", accent: "#00D4FF", xp: 80,
    vi: ["Toàn năng", "Chơi đủ 6 trò"],
    en: ["All-Rounder", "Play all 6 games"] },
  { code: "score_900", icon: "🎯", accent: "#A855F7", xp: 90,
    vi: ["Gần tuyệt đối", "Một ván đạt 900+"],
    en: ["Near Perfect", "Score 900+ in a round"] },
  { code: "sudoku_extreme", icon: "🔥", accent: "#F59E0B", xp: 80,
    vi: ["Khắc tinh Sudoku", "Hoàn thành mức Extreme"],
    en: ["Sudoku Slayer", "Finish an Extreme board"] },
  { code: "nback_ace", icon: "🔮", accent: "#A855F7", xp: 90,
    vi: ["Cao thủ N-Back", "Đạt 700+ ở N-Back"],
    en: ["N-Back Ace", "Score 700+ at N-Back"] },
];

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(245,158,11,0.16)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const TXT = {
  vi: {
    title: "THÀNH TỰU",
    sub: "Mở khoá bằng cách luyện tập — XP thưởng được cộng tự động",
    unlocked: "đã mở",
    newBadge: "Mở khoá thành tựu mới!",
    loading: "Đang tải…",
  },
  en: {
    title: "ACHIEVEMENTS",
    sub: "Unlocked by training — bonus XP is credited automatically",
    unlocked: "unlocked",
    newBadge: "New achievement unlocked!",
    loading: "Loading…",
  },
};

export function AchievementsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const { lang } = useLang();
  const s = TXT[lang];
  const [rows, setRows] = useState<AchievementUnlock[] | null>(null);

  useEffect(() => {
    let alive = true;
    syncAchievements()
      .then((data) => {
        if (!alive) return;
        setRows(data);
        // Chỉ khoe khi có cái vừa mở trong lần đồng bộ này.
        if (data.some((r) => r.newly_unlocked)) toast.success(s.newBadge);
      })
      .catch((err) => {
        if (alive) setRows([]);
        console.error("Sync achievements failed:", err);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const unlocked = useMemo(
    () => new Set((rows ?? []).map((r) => r.code)),
    [rows],
  );

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Award size={16} style={{ color: "#F59E0B" }} />
          <span
            className="text-[11px] tracking-[0.25em] uppercase text-white"
            style={mono}
          >
            {s.title}
          </span>
        </div>
        <span className="text-[11px]" style={{ ...mono, color: "#F59E0B" }}>
          {unlocked.size}/{CATALOG.length} {s.unlocked}
        </span>
      </div>
      <p className="text-[11px] text-white/40 mb-4" style={mono}>
        {s.sub}
      </p>

      {rows === null ? (
        <div className="text-[11px] text-white/40 py-6 text-center" style={mono}>
          {s.loading}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {CATALOG.map((b) => {
            const got = unlocked.has(b.code);
            const [name, desc] = lang === "vi" ? b.vi : b.en;
            return (
              <div
                key={b.code}
                className="rounded-xl p-3 transition-all"
                style={{
                  background: got
                    ? `${b.accent}14`
                    : "rgba(255,255,255,0.025)",
                  border: `1px solid ${got ? `${b.accent}55` : "rgba(255,255,255,0.06)"}`,
                  opacity: got ? 1 : 0.55,
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xl" style={{ filter: got ? "none" : "grayscale(1)" }}>
                    {b.icon}
                  </span>
                  {got ? (
                    <span
                      className="text-[11px]"
                      style={{ ...mono, color: b.accent }}
                    >
                      +{b.xp} XP
                    </span>
                  ) : (
                    <Lock size={11} className="text-white/25" />
                  )}
                </div>
                <div
                  className="text-[11px] mb-0.5"
                  style={{ color: got ? "#fff" : "rgba(255,255,255,0.6)" }}
                >
                  {name}
                </div>
                <div className="text-[11px] text-white/35 leading-snug" style={mono}>
                  {desc}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
