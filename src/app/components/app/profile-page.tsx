import { LogOut } from "lucide-react";
import type { Profile } from "../../lib/api";
import type { Translation } from "../../lib/i18n";
import { FriendsPanel } from "../friends-panel";
import { SettingsPanel } from "../settings-panel";
import { GlassCard } from "../ui/glass-card";
import { StatMini } from "../ui/stat-mini";

export function ProfilePage({
  profile,
  t,
  cognitiveIndex,
  isGuest,
  isAdmin,
  onProfileChange,
  onDeleted,
  onRegister,
  onOpenOnboarding,
  onLogout,
}: {
  profile: Profile;
  t: Translation;
  cognitiveIndex: number;
  isGuest: boolean;
  isAdmin: boolean;
  onProfileChange: (profile: Profile) => void;
  onDeleted: () => void;
  onRegister: () => void;
  onOpenOnboarding: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard accent="#00D4FF" className="p-5">
          <StatMini
            label={t.cognitive_index}
            value={String(cognitiveIndex)}
            unit={t.pts}
            color="#00D4FF"
          />
        </GlassCard>

        <GlassCard accent="#A855F7" className="p-5">
          <StatMini
            label={t.clearance}
            value={isGuest ? "GUEST" : isAdmin ? "Ω-1" : "STD"}
            unit={isGuest ? "trial" : isAdmin ? "admin" : "user"}
            color="#A855F7"
          />
        </GlassCard>
      </div>

      {!isGuest && <FriendsPanel />}
      {!isGuest ? (
        <SettingsPanel
          profile={profile}
          isAdmin={isAdmin}
          onProfileChange={onProfileChange}
          onDeleted={onDeleted}
        />
      ) : (
        <div
          className="rounded-2xl p-6 text-sm leading-relaxed text-slate-300"
          style={{
            background: "rgba(var(--neuro-panel-rgb),0.62)",
            border: "1px solid rgba(var(--neuro-green-rgb),0.22)",
          }}
        >
          {t.guest_banner}
          <button
            type="button"
            onClick={onRegister}
            className="mt-4 h-10 rounded-xl px-4 text-xs font-bold tracking-wider"
            style={{
              background: "rgba(var(--neuro-green-rgb),0.15)",
              color: "#34D399",
              border: "1px solid rgba(var(--neuro-green-rgb),0.35)",
            }}
          >
            {t.guest_register}
          </button>
        </div>
      )}

      <div className="flex justify-start">
        <button
          type="button"
          onClick={onOpenOnboarding}
          className="rounded-xl px-4 py-2.5 text-xs font-semibold tracking-wider transition-all hover:brightness-125"
          style={{
            color: "#00D4FF",
            background: "rgba(var(--neuro-cyan-rgb),0.08)",
            border: "1px solid rgba(var(--neuro-cyan-rgb),0.22)",
          }}
        >
          {t.onboarding_reopen}
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onLogout}
          className="py-2.5 px-5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200"
          style={{
            background: "rgba(var(--neuro-red-rgb),0.1)",
            color: "#F43F5E",
            border: "1px solid rgba(var(--neuro-red-rgb),0.28)",
          }}
        >
          <LogOut size={13} /> {t.sign_out}
        </button>
      </div>
    </div>
  );
}
