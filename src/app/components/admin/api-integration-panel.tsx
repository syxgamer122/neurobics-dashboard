import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { HAS_SUPABASE_CONFIG, SUPABASE_URL } from "../../lib/supabase-config";
import { ADMIN_COLORS } from "./constants";
import { EnvField, Panel } from "./ui";

const { green, blue, red } = ADMIN_COLORS;

export function ApiIntegrationPanel() {
  const [revealUrl, setRevealUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const copyUrl = () => {
    void navigator.clipboard?.writeText(SUPABASE_URL);
    setCopied(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1500);
  };

  return (
    <Panel accent={blue} className="lg:col-span-1">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={14} style={{ color: blue }} />
        <span className="text-xs font-bold tracking-widest text-white font-mono">
          API INTEGRATION
        </span>
      </div>
      <EnvField
        label="VITE_SUPABASE_URL"
        value={SUPABASE_URL}
        revealed={revealUrl}
        onToggle={() => setRevealUrl((value) => !value)}
        onCopy={copyUrl}
        copied={copied}
        mask={(value) => "•".repeat(Math.min(value.length, 44))}
        accent={blue}
      />
      {/* Anon key KHONG hien ra: admin panel thuong duoc chup/chia se man hinh. */}
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
            ? "OK — da nap tu bien moi truong (an)"
            : "THIEU — kiem tra .env / Vercel env vars"}
        </div>
      </div>
      <div
        className="mt-4 p-3 rounded-lg text-xs text-slate-500 leading-relaxed"
        style={{ background: `${blue}06`, border: `1px solid ${blue}18` }}
      >
        <span style={{ color: blue }}>ⓘ</span> Anon key is safe for client use.
        Service role key is never exposed to the browser.
      </div>
    </Panel>
  );
}
