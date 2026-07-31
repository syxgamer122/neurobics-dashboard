import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchProgressSeries, type ProgressPoint } from "../lib/api";

type AxisName = "speed" | "focus" | "spatial" | "logic" | "memory";

const AXES: { key: AxisName; short: string; name: string; color: string }[] = [
  { key: "speed", short: "SPD", name: "Tốc độ", color: "#10B981" },
  { key: "focus", short: "FOC", name: "Tập trung", color: "#A855F7" },
  { key: "spatial", short: "SPA", name: "Không gian", color: "#F59E0B" },
  { key: "logic", short: "LOG", name: "Logic", color: "#00D4FF" },
  { key: "memory", short: "MEM", name: "Trí nhớ", color: "#F43F5E" },
];

const RANGES: { days: number; label: string }[] = [
  { days: 7, label: "7 NGÀY" },
  { days: 30, label: "30 NGÀY" },
  { days: 90, label: "90 NGÀY" },
];

const panelStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.55)",
  border: "1px solid rgba(148,163,184,0.14)",
  backdropFilter: "blur(12px)",
};

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const fmtDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

type Row = ProgressPoint & { label: string };

export function ProgressChart() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hidden, setHidden] = useState<AxisName[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const series = await fetchProgressSeries(days);
      setRows(series.map((p) => ({ ...p, label: fmtDay(p.day) })));
    } catch (err) {
      console.error("fetchProgressSeries failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const totalRounds = rows.reduce((sum, r) => sum + r.rounds, 0);
    const totalXp = rows.reduce((sum, r) => sum + r.xp, 0);
    const activeDays = rows.filter((r) => r.rounds > 0).length;
    const scored = rows.filter((r) => r.avg_score !== null);

    const avgOf = (list: Row[]): number | null => {
      if (list.length === 0) return null;
      const sum = list.reduce((acc, r) => acc + Number(r.avg_score ?? 0), 0);
      return sum / list.length;
    };

    // So trung bình nửa đầu với nửa sau để biết xu hướng đi lên hay đi xuống.
    const half = Math.floor(scored.length / 2);
    const older = avgOf(scored.slice(0, half));
    const newer = avgOf(scored.slice(scored.length - half));
    const delta =
      half > 0 && older !== null && newer !== null ? newer - older : null;

    return { totalRounds, totalXp, activeDays, avgScore: avgOf(scored), delta };
  }, [rows]);

  const toggleAxis = (key: AxisName) => {
    setHidden((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const axisTick = {
    fill: "#64748b",
    fontSize: 10,
    fontFamily: mono.fontFamily,
  };

  const tooltipStyle: React.CSSProperties = {
    background: "rgba(2,6,23,0.94)",
    border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 12,
    fontSize: 11,
    fontFamily: mono.fontFamily,
  };

  return (
    <div className="mb-8">
      {/* ── Tiêu đề và chọn khoảng thời gian ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          className="text-[12px] tracking-[0.3em]"
          style={{ ...mono, color: "#00D4FF" }}
        >
          TIẾN TRÌNH
        </h3>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className="rounded-full px-3 py-1 text-[10px] tracking-wider transition"
              style={{
                ...mono,
                color: days === r.days ? "#020617" : "#94a3b8",
                background:
                  days === r.days ? "#00D4FF" : "rgba(148,163,184,0.1)",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bốn ô tóm tắt ── */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="SỐ VÁN"
          value={String(summary.totalRounds)}
          color="#e2e8f0"
        />
        <SummaryCard label="XP" value={String(summary.totalXp)} color="#10B981" />
        <SummaryCard
          label="NGÀY CÓ TẬP"
          value={`${summary.activeDays}/${rows.length}`}
          color="#A855F7"
        />
        <SummaryCard
          label="ĐIỂM TB"
          value={summary.avgScore === null ? "—" : summary.avgScore.toFixed(0)}
          color="#00D4FF"
          hint={
            summary.delta === null
              ? undefined
              : `${summary.delta >= 0 ? "▲" : "▼"} ${Math.abs(summary.delta).toFixed(0)}`
          }
          hintColor={
            summary.delta === null || summary.delta >= 0 ? "#10B981" : "#F43F5E"
          }
        />
      </div>

      {/* ── XP và số ván mỗi ngày ── */}
      <div className="mb-3 rounded-2xl p-4" style={panelStyle}>
        <p
          className="mb-3 text-[10px] tracking-[0.2em]"
          style={{ ...mono, color: "#64748b" }}
        >
          XP VÀ SỐ VÁN MỖI NGÀY
        </p>
        {loading ? (
          <Empty text="đang tải…" />
        ) : summary.totalRounds === 0 ? (
          <Empty text="chưa có ván nào trong khoảng này" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart
              data={rows}
              margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
            >
              <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                yAxisId="xp"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="rounds"
                orientation="right"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#94a3b8" }}
                cursor={{ fill: "rgba(148,163,184,0.08)" }}
              />
              <Bar
                yAxisId="xp"
                dataKey="xp"
                name="XP"
                fill="#10B981"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Line
                yAxisId="rounds"
                type="monotone"
                dataKey="rounds"
                name="Số ván"
                stroke="#A855F7"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Diễn biến 5 trục ── */}
      <div className="rounded-2xl p-4" style={panelStyle}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p
            className="text-[10px] tracking-[0.2em]"
            style={{ ...mono, color: "#64748b" }}
          >
            DIỄN BIẾN 5 TRỤC
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AXES.map((a) => {
              const off = hidden.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggleAxis(a.key)}
                  className="rounded-full px-2.5 py-1 text-[9px] tracking-wider transition"
                  style={{
                    ...mono,
                    color: off ? "#475569" : a.color,
                    background: off ? "rgba(148,163,184,0.06)" : `${a.color}1f`,
                    border: `1px solid ${
                      off ? "rgba(148,163,184,0.12)" : `${a.color}55`
                    }`,
                  }}
                >
                  {a.short}
                </button>
              );
            })}
          </div>
        </div>
        {loading ? (
          <Empty text="đang tải…" />
        ) : summary.totalRounds === 0 ? (
          <Empty text="chưa đủ dữ liệu để vẽ" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={rows}
              margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
            >
              <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                domain={[0, 1000]}
                ticks={[0, 250, 500, 750, 1000]}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#94a3b8" }}
              />
              {AXES.filter((a) => !hidden.includes(a.key)).map((a) => (
                <Line
                  key={a.key}
                  type="monotone"
                  dataKey={a.key}
                  name={a.name}
                  stroke={a.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        <p
          className="mt-3 text-[9px] leading-relaxed"
          style={{ ...mono, color: "#475569" }}
        >
          Mỗi điểm là trung bình của trục đó trong ngày. Ngày không chơi game
          liên quan sẽ bị bỏ trống và đường biểu diễn nối thẳng qua. Bấm nhãn
          SPD/FOC/SPA/LOG/MEM để ẩn hoặc hiện từng trục.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  hint,
  hintColor,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
  hintColor?: string;
}) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={panelStyle}>
      <p
        className="text-[9px] tracking-[0.18em]"
        style={{ ...mono, color: "#475569" }}
      >
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[18px]" style={{ ...mono, color }}>
          {value}
        </span>
        {hint ? (
          <span
            className="text-[10px]"
            style={{ ...mono, color: hintColor ?? "#64748b" }}
          >
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex h-[180px] items-center justify-center text-[11px]"
      style={{ ...mono, color: "#475569" }}
    >
      {text}
    </div>
  );
}
