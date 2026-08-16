import { ShieldCheck } from "lucide-react";
import { HAS_SUPABASE_CONFIG, SUPABASE_URL } from "../../lib/supabase-config";
import { ADMIN_COLORS } from "./constants";
import { Panel } from "./ui";

const { green, blue, red } = ADMIN_COLORS;

export function ApiIntegrationPanel() {
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
    </Panel>
  );
}
