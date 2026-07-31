import { useRef, useState } from "react";
import {
  Camera,
  Trash2,
  KeyRound,
  Calendar,
  Languages,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  changePassword,
  deleteActiveUserAccount,
  removeAvatar,
  saveBirthYear,
  uploadAvatar,
  type Profile,
} from "../lib/api";
import { useLang, type Lang } from "../lib/i18n";
import {
  getLevelColor,
  getLevelProgress,
  getLevelTitle,
} from "../lib/xp";

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const cardStyle = (accent: string): React.CSSProperties => ({
  background: "rgba(10,16,36,0.55)",
  border: `1px solid ${accent}33`,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
});

function SectionTitle({
  color,
  icon,
  children,
}: {
  color: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color }}>{icon}</span>
      <span
        className="text-[11px] font-bold tracking-[0.18em] uppercase"
        style={{ ...mono, color }}
      >
        {children}
      </span>
    </div>
  );
}

function fieldStyle(): React.CSSProperties {
  return {
    ...mono,
    background: "rgba(5,10,24,0.7)",
    border: "1px solid rgba(0,212,255,0.18)",
    color: "#E2E8F0",
  };
}

export function SettingsPanel({
  profile,
  isAdmin,
  onProfileChange,
  onDeleted,
}: {
  profile: Profile;
  isAdmin: boolean;
  onProfileChange: (p: Profile) => void;
  onDeleted: () => void;
}) {
  const { t, lang, toggle } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [birthInput, setBirthInput] = useState(
    profile.birth_year ? String(profile.birth_year) : "",
  );
  const [birthBusy, setBirthBusy] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const level = getLevelProgress(profile.total_xp ?? 0);
  const levelColor = getLevelColor(level.level);
  const initials = profile.username.slice(0, 2).toUpperCase();

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const next = await uploadAvatar(file);
      onProfileChange(next);
      toast.success(t.settings_avatar_ok);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarBusy(true);
    try {
      const next = await removeAvatar();
      onProfileChange(next);
      toast.success(t.settings_avatar_removed);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setAvatarBusy(false);
    }
  };

  const onSaveBirth = async () => {
    const year = parseInt(birthInput, 10);
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(year) || year < 1900 || year > thisYear) {
      toast.error(t.birth_year_invalid);
      return;
    }
    setBirthBusy(true);
    try {
      const next = await saveBirthYear(year);
      onProfileChange(next);
      toast.success(t.settings_birth_ok);
    } catch (err) {
      console.error(err);
      toast.error(t.save_failed);
    } finally {
      setBirthBusy(false);
    }
  };

  const onChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error(t.settings_pw_mismatch);
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
      toast.success(t.settings_pw_ok);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setPwBusy(false);
    }
  };

  const onDelete = async () => {
    if (deleteConfirm.trim().toLowerCase() !== profile.username.toLowerCase()) {
      toast.error(t.settings_delete_confirm_err);
      return;
    }
    setDeleteBusy(true);
    try {
      await deleteActiveUserAccount();
      toast.success(t.settings_delete_ok);
      onDeleted();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t.save_failed);
      setDeleteBusy(false);
    }
  };

  const setLang = (next: Lang) => {
    if (lang !== next) toggle();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* ── Identity card ── */}
      <div className="rounded-2xl p-6 flex flex-col items-center text-center" style={cardStyle("#F59E0B")}>
        <div className="relative">
          <div
            className="w-28 h-28 rounded-2xl overflow-hidden flex items-center justify-center text-3xl font-bold uppercase"
            style={{
              background: profile.avatar_url
                ? "#0B1228"
                : "linear-gradient(135deg, #A855F7, #7C3AED)",
              boxShadow: "0 0 40px rgba(168,85,247,0.45)",
              ...mono,
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <button
            type="button"
            disabled={avatarBusy}
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:brightness-125 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #00D4FF, #7C3AED)",
              border: "2px solid #050A18",
              color: "#fff",
            }}
            title={t.settings_avatar_change}
          >
            {avatarBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Camera size={16} />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="text-xl font-bold text-white mt-5">{profile.username}</div>
        <div className="text-[11px] text-slate-500 mt-1" style={mono}>
          {isAdmin ? t.omega_label : t.operator_label}
        </div>

        <div
          className="mt-4 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider"
          style={{
            ...mono,
            color: levelColor,
            background: `${levelColor}18`,
            border: `1px solid ${levelColor}44`,
          }}
        >
          {t.level_label} {level.level} · {getLevelTitle(level.level)}
        </div>

        <div className="w-full mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.round(level.progress * 100)}%`,
              background: levelColor,
              boxShadow: `0 0 12px ${levelColor}88`,
            }}
          />
        </div>
        <div className="text-[10px] text-slate-500 mt-1.5" style={mono}>
          {level.xpIntoLevel} / {level.xpNeeded} XP
        </div>

        {profile.avatar_url && (
          <button
            type="button"
            disabled={avatarBusy}
            onClick={() => void onRemoveAvatar()}
            className="mt-4 text-[11px] flex items-center gap-1.5 transition-colors hover:text-rose-300 disabled:opacity-50"
            style={{ ...mono, color: "#F43F5E" }}
          >
            <Trash2 size={12} /> {t.settings_avatar_remove}
          </button>
        )}

        <p className="text-[10px] text-slate-600 mt-4 leading-relaxed" style={mono}>
          {t.settings_avatar_hint}
        </p>
      </div>

      {/* ── Settings columns ── */}
      <div className="lg:col-span-2 space-y-5">
        {/* Birth year + language */}
        <div className="rounded-2xl p-6" style={cardStyle("#00D4FF")}>
          <SectionTitle color="#00D4FF" icon={<Calendar size={14} />}>
            {t.settings_profile_section}
          </SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-500 tracking-wider uppercase mb-1.5 block" style={mono}>
                {t.birth_year_placeholder}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={birthInput}
                  onChange={(e) => setBirthInput(e.target.value)}
                  placeholder={t.birth_year_placeholder}
                  className="flex-1 h-10 px-3 rounded-xl text-sm outline-none"
                  style={fieldStyle()}
                />
                <button
                  type="button"
                  disabled={birthBusy}
                  onClick={() => void onSaveBirth()}
                  className="h-10 px-4 rounded-xl text-xs font-bold tracking-wider disabled:opacity-50"
                  style={{
                    ...mono,
                    background: "rgba(0,212,255,0.12)",
                    color: "#00D4FF",
                    border: "1px solid rgba(0,212,255,0.35)",
                  }}
                >
                  {birthBusy ? <Loader2 size={14} className="animate-spin" /> : t.save_btn}
                </button>
              </div>
              {profile.birth_year && (
                <p className="text-[10px] text-slate-500 mt-1.5" style={mono}>
                  {t.settings_birth_current}: {profile.birth_year}
                </p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-slate-500 tracking-wider uppercase mb-1.5 block" style={mono}>
                <span className="inline-flex items-center gap-1">
                  <Languages size={11} /> {t.settings_language}
                </span>
              </label>
              <div className="flex gap-2">
                {(["vi", "en"] as Lang[]).map((code) => {
                  const active = lang === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLang(code)}
                      className="flex-1 h-10 rounded-xl text-xs font-bold tracking-wider transition-all"
                      style={{
                        ...mono,
                        background: active
                          ? "rgba(0,212,255,0.18)"
                          : "rgba(5,10,24,0.7)",
                        color: active ? "#00D4FF" : "#94A3B8",
                        border: active
                          ? "1px solid rgba(0,212,255,0.45)"
                          : "1px solid rgba(0,212,255,0.12)",
                      }}
                    >
                      {code === "vi" ? t.settings_lang_vi : t.settings_lang_en}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="rounded-2xl p-6" style={cardStyle("#A855F7")}>
          <SectionTitle color="#A855F7" icon={<KeyRound size={14} />}>
            {t.settings_password_section}
          </SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 tracking-wider uppercase mb-1.5 block" style={mono}>
                {t.settings_pw_current}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                style={fieldStyle()}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 tracking-wider uppercase mb-1.5 block" style={mono}>
                {t.settings_pw_new}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                style={fieldStyle()}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 tracking-wider uppercase mb-1.5 block" style={mono}>
                {t.settings_pw_confirm}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                style={fieldStyle()}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={pwBusy || !curPw || !newPw || !confirmPw}
            onClick={() => void onChangePassword()}
            className="mt-4 h-10 px-5 rounded-xl text-xs font-bold tracking-wider inline-flex items-center gap-2 disabled:opacity-40"
            style={{
              ...mono,
              background: "rgba(168,85,247,0.15)",
              color: "#C084FC",
              border: "1px solid rgba(168,85,247,0.4)",
            }}
          >
            {pwBusy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {t.settings_pw_submit}
          </button>
          <p className="text-[10px] text-slate-600 mt-2" style={mono}>
            {t.settings_pw_hint}
          </p>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl p-6" style={cardStyle("#F43F5E")}>
          <SectionTitle color="#F43F5E" icon={<ShieldAlert size={14} />}>
            {t.settings_danger_section}
          </SectionTitle>

          <div
            className="flex gap-3 p-3 rounded-xl mb-4"
            style={{
              background: "rgba(244,63,94,0.08)",
              border: "1px solid rgba(244,63,94,0.22)",
            }}
          >
            <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-rose-200/80 leading-relaxed">
              {t.settings_delete_warn}
            </p>
          </div>

          <label className="text-[10px] text-slate-500 tracking-wider uppercase mb-1.5 block" style={mono}>
            {t.settings_delete_type_username.replace("{u}", profile.username)}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={profile.username}
              className="flex-1 h-10 px-3 rounded-xl text-sm outline-none"
              style={fieldStyle()}
            />
            <button
              type="button"
              disabled={
                deleteBusy ||
                deleteConfirm.trim().toLowerCase() !== profile.username.toLowerCase()
              }
              onClick={() => void onDelete()}
              className="h-10 px-5 rounded-xl text-xs font-bold tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-40"
              style={{
                ...mono,
                background: "rgba(244,63,94,0.18)",
                color: "#FB7185",
                border: "1px solid rgba(244,63,94,0.45)",
              }}
            >
              {deleteBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {t.settings_delete_btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
