/**
 * Man hinh chan nguoi khong phai admin.
 * Tach rieng de admin-panel.tsx chi con lo phan dieu khien that su.
 */
import { ShieldAlert } from "lucide-react";
import { ADMIN_COLORS } from "./constants";

const { amber, red } = ADMIN_COLORS;

export function AccessDenied({
  username,
  onExit,
}: {
  username: string;
  onExit: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#04060D" }}
    >
      <div
        className="max-w-md w-full rounded-2xl p-8 flex flex-col items-center gap-5 text-center"
        style={{
          background: "rgba(20,6,10,0.9)",
          border: `1px solid ${red}55`,
          boxShadow: `0 0 80px ${red}22`,
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: `${red}12`,
            border: `2px solid ${red}55`,
            boxShadow: `0 0 30px ${red}33`,
          }}
        >
          <ShieldAlert size={28} style={{ color: red }} />
        </div>
        <div className="space-y-2">
          <div
            className="text-xl font-bold tracking-[0.25em] font-mono"
            style={{ color: red }}
          >
            ACCESS DENIED
          </div>
          <div className="text-xs text-slate-500">
            Signed in as <span style={{ color: amber }}>{username}</span> ·
            required <span style={{ color: red }}>admin role</span>
          </div>
        </div>
        <button
          onClick={onExit}
          className="w-full py-2.5 rounded-xl text-xs tracking-widest font-bold font-mono"
          style={{
            background: `${red}12`,
            color: red,
            border: `1px solid ${red}33`,
          }}
        >
          RETURN
        </button>
      </div>
    </div>
  );
}
