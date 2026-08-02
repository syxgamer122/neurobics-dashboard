/**
 * The signed-in user's own profile: read, birth year, score reset, password,
 * avatar upload/removal and account deletion.
 */
import {
  getSupabase,
  describeError,
  PROFILE_COLS,
  sanitizeProfile,
  hydrateProfile,
  currentUserId,
  serverPost,
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  type Profile,
} from "./internal";
import { logError } from "../logger";

export async function fetchProfile(): Promise<Profile | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const msg = describeError(error, "Fetch profile failed");
    logError(msg);
    throw new Error(msg);
  }
  return data ? hydrateProfile(data as Profile) : null;
}

/** Persists the user's birth year, which anchors the brain-age calculation. */
export async function saveBirthYear(birthYear: number): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Save birth year failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ birth_year: birthYear })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, "Save birth year failed");
    logError(msg);
    throw new Error(msg);
  }
  return hydrateProfile(data as Profile);
}

/**
 * Records activity for "today" in Vietnam time and updates the streak:
 *  - same VN day as last_active_date        → streak unchanged (already counted)
 *  - exactly 1 VN calendar day later         → streak + 1
 *  - more than 1 day later (or first ever)   → streak reset to 1
 * Writes both synapse_streak and last_active_date back to the row.
 */
// ─── Admin controls (active user) ───────────────────────────────────────────────

/**
 * Wipes all cognitive metrics and the streak back to 0 for the active user.
 * Forcefully zeroes ALL 5 axis columns (including cfop_spatial_record) so legacy
 * accounts with pre-migration cumulative values >1000 can be re-baselined — the
 * upward-only pullUpRating can never bring them back down on its own.
 */
export async function resetActiveUserScores(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Reset scores failed: not authenticated.");

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({
      algebraic_logic_score: 0,
      memory_score: 0,
      speed_score: 0,
      focus_score: 0,
      cfop_spatial_record: 0,
      synapse_streak: 0,
      schulte_sessions: 0,
      sudoku_sessions: 0,
      stroop_sessions: 0,
      reaction_sessions: 0,
      memory_sessions: 0,
      nback_sessions: 0,
      math_sessions: 0,
      total_xp: 0,
      last_active_date: null,
    })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();

  if (error) {
    const msg = describeError(error, "Reset scores failed");
    logError(msg);
    throw new Error(msg);
  }
  return sanitizeProfile(data as Profile);
}

/**
 * Deletes the active account end-to-end via the Edge Function (service role):
 * profile row, avatars in storage, and the auth.users record. Then clears the
 * local session so the browser cannot reuse a dead JWT.
 */
export async function deleteActiveUserAccount(): Promise<void> {
  await serverPost<{ ok: true }>("delete-account", {});

  try {
    await getSupabase().auth.signOut();
  } catch {
    /* session may already be invalid after server-side auth.admin.deleteUser */
  }
  try {
    Object.keys(globalThis.localStorage ?? {})
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => globalThis.localStorage.removeItem(k));
  } catch {
    /* localStorage may be unavailable — signOut already handled the session */
  }
}

/**
 * Re-authenticate with the current password, then set a new one.
 * Username is mapped to the spoofed email the same way signup/login do.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!currentPassword || !newPassword) {
    throw new Error("Both current and new passwords are required.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  if (currentPassword === newPassword) {
    throw new Error("New password must be different from the current one.");
  }

  const {
    data: { user },
    error: userErr,
  } = await getSupabase().auth.getUser();
  if (userErr || !user?.email) {
    throw new Error("Change password failed: not authenticated.");
  }

  const { error: reauthErr } = await getSupabase().auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthErr) {
    throw new Error("Current password is incorrect.");
  }

  const { error } = await getSupabase().auth.updateUser({
    password: newPassword,
  });
  if (error) {
    throw new Error(error.message || "Change password failed.");
  }
}

/** Upload a new avatar image and persist its public URL on the profile. */
export async function uploadAvatar(file: File): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Upload avatar failed: not authenticated.");

  if (!AVATAR_MIME.has(file.type)) {
    throw new Error("Avatar must be JPEG, PNG, WebP, or GIF.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Avatar must be 2 MB or smaller.");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  // Fixed path so each upload overwrites the previous file for this user.
  const path = `${userId}/avatar.${ext}`;

  // Drop leftover files from previous uploads with a different extension
  // (avatar.jpg left behind after switching to avatar.png, etc.).
  const { data: listed } = await getSupabase().storage.from("avatars").list(userId);
  if (listed && listed.length > 0) {
    const stale = listed
      .map((f) => f.name)
      .filter((name) => name !== `avatar.${ext}`)
      .map((name) => `${userId}/${name}`);
    if (stale.length > 0) {
      await getSupabase().storage.from("avatars").remove(stale);
    }
  }

  const { error: upErr } = await getSupabase().storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (upErr) {
    throw new Error(describeError(upErr, "Upload avatar failed"));
  }

  const { data: pub } = getSupabase().storage.from("avatars").getPublicUrl(path);
  // Bust CDN/browser cache after overwrite.
  const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();
  if (error) {
    throw new Error(describeError(error, "Save avatar URL failed"));
  }
  return hydrateProfile(data as Profile);
}

/** Remove avatar file(s) for the current user and clear avatar_url. */
export async function removeAvatar(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Remove avatar failed: not authenticated.");

  const { data: listed } = await getSupabase().storage
    .from("avatars")
    .list(userId);
  if (listed && listed.length > 0) {
    const paths = listed.map((f) => `${userId}/${f.name}`);
    await getSupabase().storage.from("avatars").remove(paths);
  }

  const { data, error } = await getSupabase()
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();
  if (error) {
    throw new Error(describeError(error, "Clear avatar URL failed"));
  }
  return hydrateProfile(data as Profile);
}
