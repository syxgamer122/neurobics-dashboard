import {
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

import { useLang } from "../../lib/i18n";
import { GlassCard } from "../ui/glass-card";
import { Label } from "../ui/label";

export type CognitiveDatum = { subject: string; value: number };

export type CognitiveMatrixCardProps = {
  data: CognitiveDatum[];
  rounds: number;
};

/** Radar 5 truc + dai so lieu tom tat ben duoi. */
export function CognitiveMatrixCard({ data, rounds }: CognitiveMatrixCardProps) {
  const { t } = useLang();

  return (
    <GlassCard accent="#00D4FF" className="lg:col-span-2 p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <Label color="#00D4FF">{t.cog_matrix}</Label>
          <div className="text-sm text-slate-400 mt-1">
            {t.cog_matrix_sub(rounds)}
          </div>
        </div>
        <div
          className="text-xs px-3 py-1.5 rounded-lg shrink-0"
          style={{
            background: "rgba(168,85,247,0.1)",
            color: "#A855F7",
            border: "1px solid rgba(168,85,247,0.2)",
          }}
        >
          {t.live}
        </div>
      </div>
      <div className="h-[270px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            margin={{ top: 10, right: 30, bottom: 10, left: 30 }}
          >
            <PolarGrid
              key="polar-grid"
              stroke="rgba(0,212,255,0.09)"
            />
            <PolarAngleAxis
              key="polar-angle"
              dataKey="subject"
              tick={{
                fill: "#94a3b8",
                fontSize: 11,
              }}
            />
            <PolarRadiusAxis
              key="polar-radius"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              key="radar-cognition"
              name="Cognition"
              dataKey="value"
              stroke="#00D4FF"
              fill="#00D4FF"
              fillOpacity={0.12}
              strokeWidth={2}
              isAnimationActive={false}
              dot={false}
              style={{
                filter: "drop-shadow(0 0 8px rgba(0,212,255,0.5))",
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div
        className="grid grid-cols-5 gap-1 sm:gap-2 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {data.map((d) => (
          <div key={d.subject} className="text-center min-w-0">
            <div className="text-[10px] sm:text-xs text-slate-500 mb-0.5 truncate">
              {d.subject.slice(0, 3).toUpperCase()}
            </div>
            <div className="text-xs sm:text-sm font-bold text-white tabular-nums">
              {d.value}
            </div>
            <div
              className="h-1 rounded-full mt-1"
              style={{
                background:
                  "linear-gradient(90deg, #00D4FF, #A855F7)",
                opacity: d.value / 100,
                boxShadow: "0 0 6px rgba(0,212,255,0.4)",
              }}
            />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
