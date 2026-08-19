/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
// @ts-nocheck
/**
 * Admin-only operations against another user's profile.
 */
import {
  getSupabase,
  describeError,
  sanitizeProfile,
  hydrateProfile,
  serverPost,
  type Profile,
} from "./internal";
// AxisKey song o ../axes, khong phai ./internal. Thieu import nay thi
// AdminGrant khong bien dich duoc va ca admin-panel cung do theo.
import { type AxisKey } from "../axes";

// ─── Admin: operate on ANY user (requires admin RLS policy) ──────────────────

export async function adminListProfiles(): Promise<Profile[]> {
  const result = await serverGet<{ profiles: Profile[] }>(
    "admin-list-profiles",
  );
  return result.profiles.map(hydrateProfile);
}

/** Fetch a single profile by ID (admin use) using SECURITY DEFINER RPC. */
export async function adminFetchUser(targetId: string): Promise<Profile> {
  const { data, error } = await getSupabase().rpc("admin_get_profile", {
    p_target_id: targetId,
  });
  if (error) throw new Error(describeError(error, "adminFetchUser"));
  if (!data) throw new Error("Profile not found or access denied");
  return hydrateProfile(data as Profile);
}

export type AdminGrant = {
  axes?: Partial<Record<AxisKey, number>>;
  xp?: number;
  mode?: "add" | "set";
};

export async function adminApplyGrant(
  targetId: string,
  grant: AdminGrant,
): Promise<Profile> {
  const result = await serverPost<{ profile: Profile }>("admin-grant", {
    targetId,
    ...grant,
  });
  return sanitizeProfile(result.profile);
}

/** Backward-compatible helper: add the same amount to every cognitive axis. */
export function adminAddPoints(
  targetId: string,
  delta: number,
): Promise<Profile> {
  return adminApplyGrant(targetId, {
    axes: {
      logic: delta,
      memory: delta,
      speed: delta,
      focus: delta,
      spatial: delta,
    },
  });
}

/** Reset all scores of any user to 0 (all 5 axes forcefully zeroed). */
export async function adminResetScores(targetId: string): Promise<Profile> {
  const result = await serverPost<{ profile: Profile }>("admin-reset", {
    targetId,
  });
  return sanitizeProfile(result.profile);
}

/** Admin xoa user tron (profile + auth + avatar) qua Edge Function. */
export async function adminDeleteUser(targetId: string): Promise<void> {
  await serverPost<{ ok: true }>("admin-delete-user", { targetId });
}
