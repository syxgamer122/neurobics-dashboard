import { ShieldCheck, Sliders } from "lucide-react";
import { HAS_SUPABASE_CONFIG, SUPABASE_URL } from "../../lib/supabase-config";
import { useFeatureFlags } from "../../hooks/use-feature-flags";
import { ADMIN_COLORS } from "./constants";
import { Panel } from "./ui";

const { green, blue, red, purple } = ADMIN_COLORS;

export function ApiIntegrationPanel() {
  const { flags, loading } = useFeatureFlags();
  const flagCount = Object.keys(flags).length;
  const activeCount = Object.values(flags).filter((f) => f.enabled).length;

  return (
    <Panel accent={blue} className="lg:col-span-1">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={14} style={{ color: blue }} />
        <span className="text-xs font-bold tracking-widest text-foreground font-mono">
          API INTEGRATION
        </span>
      </div>
      <div className="mb-3">
        <div className="text-xs text-slate-500 mb-1.5 tracking-wider">
          VITE_SUPABASE_URL
        </div>
        <div
          className="rounded-lg px-3 py-2 text-xs font-mono"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${blue}18`,
            color: SUPABASE_URL ? green : red,
          }}
        >
          {SUPABASE_URL
            ? "OK — Connected"
            : "MISSING — Check .env / Vercel env vars"}
        </div>
      </div>
      <div className="mb-3">
        <div className="text-xs text-slate-500 mb-1.5 tracking-wider">
          VITE_SUPABASE_ANON_KEY
        </div>
        <div
          className="rounded-lg px-3 py-2 text-xs font-mono"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${blue}18`,
            color: HAS_SUPABASE_CONFIG ? green : red,
          }}
        >
          {HAS_SUPABASE_CONFIG
            ? "OK — Connected"
            : "MISSING — Check .env / Vercel env vars"}
        </div>
      </div>
      <div className="mb-1">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 tracking-wider">
          <span>FEATURE FLAGS SERVICE</span>
          <span style={{ color: purple }}>
            {loading ? "Syncing..." : `${activeCount}/${flagCount} Active`}
          </span>
        </div>
        <div
          className="rounded-lg px-3 py-2 text-xs font-mono flex items-center justify-between"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${purple}22`,
            color: flagCount > 0 ? green : purple,
          }}
        >
          <span>/server/flags & /server/admin-flags</span>
          <Sliders size={12} style={{ color: purple }} />
        </div>
      </div>
    </Panel>
  );
}
