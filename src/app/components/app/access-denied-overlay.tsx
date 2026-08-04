import { Terminal } from "lucide-react";
import type { Profile } from "../../lib/api";
import type { Translation } from "../../lib/i18n";

export function AccessDeniedOverlay({
  profile,
  t,
  onClose,
}: {
  profile: Profile;
  t: Translation;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(5,10,24,0.92)",
        backdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.3333))",
      }}
      onClick={onClose}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(239,68,68,0.18) 0%, transparent 65%)" }}
      />
      <div
        className="relative flex flex-col items-center gap-5 p-10 rounded-2xl max-w-sm w-full mx-4"
        style={{
          background: "rgba(13,5,10,0.9)",
          border: "1px solid rgba(239,68,68,0.5)",
          boxShadow: "0 0 80px rgba(239,68,68,0.25), inset 0 0 40px rgba(239,68,68,0.04)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div
            className="absolute w-full h-px opacity-20"
            style={{
              background: "linear-gradient(90deg, transparent, #EF4444, transparent)",
              animation: "scanline 2s linear infinite",
              top: 0,
            }}
          />
        </div>
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "2px solid rgba(239,68,68,0.5)",
            boxShadow: "0 0 30px rgba(239,68,68,0.3)",
          }}
        >
          <Terminal
            size={28}
            style={{ color: "#EF4444", filter: "drop-shadow(0 0 8px rgba(239,68,68,0.8))" }}
          />
        </div>
        <div className="text-center space-y-2">
          <div
            className="text-2xl font-bold tracking-[0.3em] font-mono"
            style={{ color: "#EF4444", textShadow: "0 0 20px rgba(239,68,68,0.6)" }}
          >
            {t.access_denied_title}
          </div>
          <div className="text-xs tracking-widest text-red-400 font-mono">{t.auth_level_msg}</div>
        </div>
        <div
          className="w-full rounded-lg p-4 space-y-1.5 text-left"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(239,68,68,0.12)" }}
        >
          {[
            { label: "USER", value: profile.username, color: "#94a3b8" },
            { label: t.required_label, value: t.access_denied_role, color: "#EF4444" },
            { label: "CLEARANCE", value: "OMEGA-1", color: "#EF4444" },
            { label: t.status_label, value: t.unauthorized_label, color: "#EF4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs w-20 shrink-0" style={{ color: "rgba(239,68,68,0.5)" }}>
                {label}
              </span>
              <span className="text-xs" style={{ color }}>{">"} {value}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-xl text-xs tracking-widest font-bold transition-all duration-200 font-mono"
          style={{
            background: "rgba(239,68,68,0.1)",
            color: "#EF4444",
            border: "1px solid rgba(239,68,68,0.3)",
          }}
        >
          {t.dismiss}
        </button>
      </div>
      <style>{`@keyframes scanline { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
    </div>
  );
}
