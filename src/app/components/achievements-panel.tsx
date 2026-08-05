import { useEffect, useMemo, useState } from "react";
import { Award, Lock } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import {
  fetchAchievementProgress,
  syncAchievements,
  type AchievementProgress,
} from "../lib/api";
import {
  BADGES,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  TIER_COLOR,
  TIER_LABEL,
  TIER_ORDER,
  type BadgeCategory,
} from "../lib/achievements";
import { logError } from "../lib/logger";

// ─── Thành tựu ────────────────────────────────────────────────
// Điều kiện mở khoá và XP thưởng nằm ở Postgres (sync_achievements).
// File này chỉ lo hiển thị: nhóm, hạng, tiến độ và trạng thái khoá/mở.

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(245,158,11,0.16)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

const TXT = {
  vi: {
    title: "THÀNH TỰU",
    sub: "Mở khoá bằng cách luyện tập — XP thưởng được cộng tự động",
    unlocked: "đã mở",
    newBadge: "Mở khoá thành tựu mới!",
    loading: "Đang tải…",
    all: "Tất cả",
    xpEarned: "XP từ thành tựu",
    empty: "Chưa có thành tựu nào ở nhóm này",
  },
  en: {
    title: "ACHIEVEMENTS",
    sub: "Unlocked by training — bonus XP is credited automatically",
    unlocked: "unlocked",
    newBadge: "New achievement unlocked!",
    loading: "Loading…",
    all: "All",
    xpEarned: "XP from achievements",
    empty: "No achievements in this group yet",
  },
};

type Filter = BadgeCategory | "all";

/** 250/1000 → "250/1000". Mốc nhị phân (goal = 1) không cần hiện số. */
function progressLabel(p: AchievementProgress | undefined): string | null {
  if (!p || p.goal <= 1) return null;
  return `${Math.min(p.progress, p.goal)}/${p.goal}`;
}

export function AchievementsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const { lang } = useLang();
  const s = TXT[lang];
  const [rows, setRows] = useState<AchievementProgress[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    // sync trước để mở khoá + cộng XP, rồi mới đọc tiến độ để số liệu khớp nhau.
    syncAchievements()
      .then(async (unlocks) => {
        if (!alive) return;
        if (unlocks.some((r) => r.newly_unlocked)) toast.success(s.newBadge);
        const progress = await fetchAchievementProgress();
        if (alive) setRows(progress);
      })
      .catch((err) => {
        if (alive) setRows([]);
        logError("Sync achievements failed:", err);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const byCode = useMemo(() => {
    const map = new Map<string, AchievementProgress>();
    for (const r of rows ?? []) map.set(r.code, r);
    return map;
  }, [rows]);

  const unlockedCount = useMemo(
    () => BADGES.filter((b) => byCode.get(b.code)?.unlocked).length,
    [byCode],
  );

  const xpEarned = useMemo(
    () =>
      BADGES.reduce(
        (sum, b) => (byCode.get(b.code)?.unlocked ? sum + b.xp : sum),
        0,
      ),
    [byCode],
  );

  // Sắp xếp: chưa mở mà gần đạt lên trước → người chơi thấy ngay mục tiêu kế tiếp.
  const visible = useMemo(() => {
    const list = BADGES.filter(
      (b) => filter === "all" || b.category === filter,
    );
    return [...list].sort((a, b) => {
      const pa = byCode.get(a.code);
      const pb = byCode.get(b.code);
      const ua = pa?.unlocked ? 1 : 0;
      const ub = pb?.unlocked ? 1 : 0;
      if (ua !== ub) return ua - ub;
      if (!pa?.unlocked) {
        const ra = pa ? pa.progress / pa.goal : 0;
        const rb = pb ? pb.progress / pb.goal : 0;
        if (rb !== ra) return rb - ra;
      }
      return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    });
  }, [filter, byCode]);

  const filters: Filter[] = ["all", ...CATEGORY_ORDER];

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <Award size={16} style={{ color: "#F59E0B" }} />
          <span className="text-xs tracking-[0.25em] uppercase text-white font-mono">
            {s.title}
          </span>
        </div>
        <span
          className="text-xs whitespace-nowrap"
          style={{ color: "#F59E0B" }}
        >
          {unlockedCount}/{BADGES.length} {s.unlocked}
        </span>
      </div>
      <p className="text-xs text-white/40 mb-3">
        {s.sub}
        {unlockedCount > 0 ? ` · +${xpEarned} ${s.xpEarned}` : ""}
      </p>

      {rows === null ? (
        <div className="text-xs text-white/40 py-6 text-center">
          {s.loading}
        </div>
      ) : (
        <>
          {/* Bộ lọc theo nhóm */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {filters.map((f) => {
              const on = filter === f;
              const label = f === "all" ? s.all : CATEGORY_LABEL[f][lang];
              const total =
                f === "all"
                  ? BADGES.length
                  : BADGES.filter((b) => b.category === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="text-xs px-2.5 py-1 rounded-lg transition-all"
                  style={{
                    background: on
                      ? "rgba(245,158,11,0.16)"
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${on ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.07)"}`,
                    color: on ? "#F59E0B" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {label} <span className="opacity-60">{total}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="text-xs text-white/35 py-6 text-center">
              {s.empty}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {visible.map((b) => {
                const p = byCode.get(b.code);
                const got = Boolean(p?.unlocked);
                const accent = TIER_COLOR[b.tier];
                const [name, desc] = lang === "vi" ? b.vi : b.en;
                const ratio = p
                  ? Math.max(0, Math.min(1, p.progress / p.goal))
                  : 0;
                const pl = progressLabel(p);
                return (
                  <div
                    key={b.code}
                    className="rounded-xl p-3 transition-all flex flex-col"
                    style={{
                      background: got
                        ? `${accent}14`
                        : "rgba(255,255,255,0.025)",
                      border: `1px solid ${got ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
                      opacity: got ? 1 : 0.62,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="text-xl"
                        style={{ filter: got ? "none" : "grayscale(1)" }}
                      >
                        {b.icon}
                      </span>
                      {got ? (
                        <span className="text-xs" style={{ color: accent }}>
                          +{b.xp} XP
                        </span>
                      ) : (
                        <Lock size={11} className="text-white/25" />
                      )}
                    </div>

                    <div
                      className="text-xs mb-0.5"
                      style={{ color: got ? "#fff" : "rgba(255,255,255,0.6)" }}
                    >
                      {name}
                    </div>
                    <div className="text-xs text-white/35 leading-snug mb-2">
                      {desc}
                    </div>

                    <div className="mt-auto">
                      {/* Thanh tiến độ: biết còn bao xa mới tới đích */}
                      {!got && (
                        <div
                          className="h-1 rounded-full overflow-hidden mb-1.5"
                          style={{ background: "rgba(255,255,255,0.07)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${ratio * 100}%`,
                              background: accent,
                              opacity: 0.75,
                            }}
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            color: accent,
                            background: `${accent}1A`,
                          }}
                        >
                          {TIER_LABEL[b.tier][lang]}
                        </span>
                        {!got && pl && (
                          <span className="text-xs text-white/40">{pl}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
