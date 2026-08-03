import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressChart } from "./progress-chart";
import {
  fetchTrainingHistory,
  fetchPersonalBests,
  type RoundGame,
  type TrainingSession,
  type PersonalBest,
} from "../lib/api";

const GAME_META: Record<RoundGame, { name: string; accent: string }> = {
  schulte: { name: "Schulte Table", accent: "#F59E0B" },
  sudoku: { name: "Sudoku", accent: "#00D4FF" },
  stroop: { name: "Stroop Test", accent: "#A855F7" },
  reaction: { name: "Reaction Time", accent: "#10B981" },
  memory: { name: "Memory Matrix", accent: "#F43F5E" },
  nback: { name: "N-Back", accent: "#8B5CF6" },
  math: { name: "Math Sprint", accent: "#38BDF8" },
  gonogo: { name: "Go / No-Go", accent: "#F97316" },
};

const GAMES = Object.keys(GAME_META) as RoundGame[];

const fmtTime = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0
    ? `${m}:${String(s).padStart(2, "0")}`
    : `${(ms / 1000).toFixed(2)}s`;
};

const fmtWhen = (iso: string): string => {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

type AxisColumn =
  | "speed_score"
  | "focus_score"
  | "spatial_score"
  | "logic_score"
  | "memory_score";

const AXES: { key: AxisColumn; short: string; color: string }[] = [
  { key: "speed_score", short: "SPD", color: "#10B981" },
  { key: "focus_score", short: "FOC", color: "#A855F7" },
  { key: "spatial_score", short: "SPA", color: "#F59E0B" },
  { key: "logic_score", short: "LOG", color: "#00D4FF" },
  { key: "memory_score", short: "MEM", color: "#F43F5E" },
];

const panelStyle: React.CSSProperties = {
  background: "rgba(10,16,36,0.55)",
  border: "1px solid rgba(0,212,255,0.14)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

export function HistoryPanel() {
  const [filter, setFilter] = useState<RoundGame | "all">("all");
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [bests, setBests] = useState<PersonalBest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, pbs] = await Promise.all([
        fetchTrainingHistory({ game: filter, limit: 100 }),
        fetchPersonalBests(),
      ]);
      setSessions(rows);
      setBests(pbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const bestByGame = useMemo(() => {
    const map: Partial<Record<RoundGame, PersonalBest>> = {};
    for (const b of bests) map[b.game] = b;
    return map;
  }, [bests]);

  const totalRounds = bests.reduce((sum, b) => sum + b.rounds, 0);
  const totalXp = bests.reduce((sum, b) => sum + b.total_xp, 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6">
      {/* ── Tiêu đề ── */}
      <div className="mb-6">
        <h2
          className="text-[13px] tracking-[0.3em] font-mono"
          style={{ color: "#00D4FF" }}
        >
          TRAINING HISTORY
        </h2>
        <p
          className="mt-1 text-xs tracking-wider"
          style={{ color: "#64748b" }}
        >
          {totalRounds} ván đã chơi · {totalXp} XP tích luỹ
        </p>
      </div>

      {/* ── Giai đoạn 3: biểu đồ tiến trình ── */}
      <ProgressChart />

      {/* ── Kỷ lục cá nhân ── */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => {
          const meta = GAME_META[game];
          const pb = bestByGame[game];
          return (
            <div
              key={game}
              className="rounded-2xl p-4"
              style={{
                ...panelStyle,
                border: `1px solid ${meta.accent}26`,
                boxShadow: pb ? `0 0 24px ${meta.accent}14` : "none"}}
            >
              <div
                className="mb-3 text-xs tracking-[0.2em] font-mono"
                style={{ color: meta.accent }}
              >
                {meta.name.toUpperCase()}
              </div>
              {pb ? (
                <div className="grid grid-cols-2 gap-y-2">
                  <Stat
                    label="KỶ LỤC"
                    value={String(pb.best_score)}
                    color={meta.accent}
                  />
                  <Stat label="NHANH NHẤT" value={fmtTime(pb.best_time_ms)} />
                  <Stat label="TRUNG BÌNH" value={pb.avg_score.toFixed(0)} />
                  <Stat label="SỐ VÁN" value={String(pb.rounds)} />
                </div>
              ) : (
                <div className="text-xs" style={{ color: "#475569" }}>
                  chưa có dữ liệu
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bộ lọc ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", ...GAMES] as const).map((id) => {
          const isActive = filter === id;
          const accent = id === "all" ? "#00D4FF" : GAME_META[id].accent;
          const label = id === "all" ? "TẤT CẢ" : GAME_META[id].name;
          return (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className="rounded-lg px-3 py-1.5 text-xs tracking-[0.15em] transition-all duration-200 font-mono"
              style={{
                color: isActive ? accent : "#64748b",
                background: isActive ? `${accent}1F` : "rgba(255,255,255,0.03)",
                border: `1px solid ${
                  isActive ? `${accent}66` : "rgba(255,255,255,0.06)"
                }`}}
            >
              {label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* ── Danh sách ván ── */}
      <div className="rounded-2xl p-1" style={panelStyle}>
        {loading && (
          <div
            className="px-4 py-10 text-center text-xs"
            style={{ color: "#64748b" }}
          >
            đang tải…
          </div>
        )}

        {!loading && error && (
          <div
            className="px-4 py-10 text-center text-xs"
            style={{ color: "#F43F5E" }}
          >
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div
            className="px-4 py-10 text-center text-xs"
            style={{ color: "#475569" }}
          >
            chưa có ván nào được ghi lại
          </div>
        )}

        {!loading &&
          !error &&
          sessions.map((s, i) => {
            const meta = GAME_META[s.game] ?? {
              name: s.game,
              accent: "#64748b",
            };
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)"}}
              >
                <div
                  className="h-8 w-1 rounded-full"
                  style={{
                    background: meta.accent,
                    boxShadow: `0 0 10px ${meta.accent}`}}
                />

                <div className="min-w-[140px] flex-1">
                  <div className="text-[12px]" style={{ color: "#e2e8f0" }}>
                    {meta.name}
                  </div>
                  <div className="text-xs" style={{ color: "#64748b" }}>
                    {s.label || "—"} · {fmtWhen(s.created_at)}
                  </div>
                </div>

                <div className="flex gap-2">
                  {AXES.map((a) => {
                    const v = s[a.key];
                    if (v === null || v === undefined) return null;
                    return (
                      <div key={a.short} className="text-center">
                        <div
                          className="text-xs"
                          style={{ color: "#475569" }}
                        >
                          {a.short}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: a.color }}
                        >
                          {v}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="w-16 text-right">
                  <div className="text-xs" style={{ color: "#475569" }}>
                    THỜI GIAN
                  </div>
                  <div className="text-xs" style={{ color: "#94a3b8" }}>
                    {fmtTime(s.time_ms)}
                  </div>
                </div>

                <div className="w-16 text-right">
                  <div className="text-xs" style={{ color: "#475569" }}>
                    ĐIỂM
                  </div>
                  <div
                    className="text-[13px]"
                    style={{ color: meta.accent }}
                  >
                    {s.round_score}
                  </div>
                </div>

                <div className="w-12 text-right">
                  <div className="text-xs" style={{ color: "#475569" }}>
                    XP
                  </div>
                  <div className="text-xs" style={{ color: "#10B981" }}>
                    +{s.xp_awarded}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "#e2e8f0",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div
        className="text-xs tracking-wider"
        style={{ color: "#475569" }}
      >
        {label}
      </div>
      <div className="text-[14px]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
