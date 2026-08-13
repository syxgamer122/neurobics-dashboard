/**
 * Che do khach (choi thu) — toan bo cuc bo, khong goi server auth/round.
 *
 * Muc dich: de nguoi moi cam nhan game truoc khi dang ky. Diem, XP chi
 * nam trong bo nho trinh duyet cua phien nay; reload/dong tab co the mat.
 */
import type { Profile } from "./api";
import { AXIS_META, type AxisKey } from "./axes";
import {
  GAME_BY_ID,
  SESSION_COLUMNS,
  type SessionColumn,
} from "./game-registry";
import { pullUpRating, sanitizeRating, type AxisRatings } from "./scoring";
import { calculateRoundXp, levelFromXp } from "./xp";
import type { RoundGame, SubmittedRound } from "./api";
import { scoreAndValidate } from "../../../supabase/functions/_shared/round-scoring";

export const GUEST_PROFILE_ID = "guest-local" as const;

/** Ho so khach = Profile + id co dinh. */
export type GuestProfile = Profile & { id: typeof GUEST_PROFILE_ID };

function emptySessionCounters(): Record<SessionColumn, number> {
  return Object.fromEntries(
    SESSION_COLUMNS.map((column) => [column, 0]),
  ) as Record<SessionColumn, number>;
}

/**
 * PHAI la `p is GuestProfile`, KHONG phai `p is Profile`.
 * Neu viet `p is Profile` ma profile da la Profile, khi isGuest=false
 * TypeScript loai het Profile -> con `never` (loi App.tsx profile.role).
 */
export function isGuestProfile(
  p: Profile | null | undefined,
): p is GuestProfile {
  return p != null && p.id === GUEST_PROFILE_ID;
}

/** Ho so ao bat dau tu 0 — du de dashboard/game chay ma khong can DB. */
export function createGuestProfile(username = "Khách"): GuestProfile {
  const now = new Date().toISOString();
  return {
    id: GUEST_PROFILE_ID,
    username,
    cfop_spatial_record: null,
    algebraic_logic_score: 0,
    memory_score: 0,
    speed_score: 0,
    focus_score: 0,
    ...emptySessionCounters(),
    total_xp: 0,
    last_active_date: null,
    birth_year: null,
    avatar_url: null,
    role: "user",
    created_at: now,
  };
}

function readAxis(profile: Profile, key: AxisKey): number {
  const col = AXIS_META[key].column;
  return sanitizeRating(profile[col] as number | null | undefined);
}

function writeAxis(profile: Profile, key: AxisKey, value: number): void {
  const col = AXIS_META[key].column;
  (profile as Record<string, unknown>)[col] = value;
}

/**
 * Cham diem van khach bang cung bo scoreAndValidate cua server, roi cap nhat
 * ho so ao + XP cuc bo. elapsedMs phai >= timeMs telemetry (giong rang buoc server).
 */
export function completeLocalRound(
  profile: Profile,
  game: RoundGame,
  telemetry: unknown,
  elapsedMs: number,
): SubmittedRound {
  const tel = telemetry as { timeMs?: number } | null;
  const telMs =
    typeof tel?.timeMs === "number" && Number.isFinite(tel.timeMs)
      ? tel.timeMs
      : 1000;
  // serverElapsed >= max(500, timeMs) de qua assert duration + time bound.
  const serverElapsed = Math.max(
    500,
    Math.round(elapsedMs),
    Math.round(telMs) + 500,
  );

  const scored = scoreAndValidate(game, telemetry, serverElapsed);
  const axes = scored.axes as AxisRatings;

  const next: Profile = { ...profile };
  (Object.keys(AXIS_META) as AxisKey[]).forEach((key) => {
    const round = axes[key];
    if (round == null) return;
    writeAxis(next, key, pullUpRating(readAxis(profile, key), round));
  });

  const sessCol = GAME_BY_ID[game].sessionColumn;
  const prevSess = Number(next[sessCol] ?? 0) || 0;
  (next as Record<string, unknown>)[sessCol] = prevSess + 1;

  const xpAwarded = calculateRoundXp(scored.headline);
  const prevXp = Math.max(0, Number(next.total_xp) || 0);
  const totalXp = prevXp + xpAwarded;
  next.total_xp = totalXp;
  next.last_active_date = new Date().toISOString().slice(0, 10);

  const prevLevel = levelFromXp(prevXp);
  const level = levelFromXp(totalXp);

  return {
    profile: next,
    axes,
    headline: scored.headline,
    label: scored.label,
    timeMs: scored.timeMs,
    xpAwarded,
    totalXp,
    level,
    leveledUp: level > prevLevel,
  };
}
