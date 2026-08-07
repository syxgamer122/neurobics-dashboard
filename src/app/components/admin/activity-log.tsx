import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { ADMIN_COLORS } from "./constants";
import { Panel } from "./ui";

const { green, red } = ADMIN_COLORS;

export function ActivityLog({ lines }: { lines: string[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <Panel accent={green} className="!p-0 overflow-hidden">
      <div
        className="flex items-center gap-2 px-5 py-3.5"
        style={{ borderBottom: `1px solid ${green}18` }}
      >
        <Terminal size={14} style={{ color: green }} />
        <span className="text-xs font-bold tracking-widest text-white font-mono">
          ACTIVITY LOG
        </span>
      </div>
      <div
        ref={logRef}
        className="px-5 py-3 h-36 overflow-y-auto text-xs leading-relaxed"
        style={{ background: "rgba(0,0,0,0.35)" }}
      >
        {lines.map((line, index) => (
          <div
            key={`${index}:${line}`}
            style={{ color: line.includes("ERR") ? red : green }}
          >
            {line}
          </div>
        ))}
      </div>
    </Panel>
  );
}
