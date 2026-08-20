/**
 * The signed-in user's own profile: read, birth year, score reset, password,
 * avatar upload/removal and account deletion.
 */
import {
  getSupabase,
  describeError,
  hydrateProfile,
  currentUserId,
  serverPost,
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  type Profile,
} from "./internal";
import { logError } from "../logger";

export async function fetchProfile(): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .rpc("get_my_profile")
    .maybeSingle();

  if (error) {
    const msg = describeError(error, "Fetch profile failed");
    logError(msg);
    throw new Error(msg);
  }

  if (!data) {
    // Attempt idempotent profile repair if session is active but profile was missing
    const { data: repaired, error: repairError } = await getSupabase()
      .rpc("ensure_my_profile")
      .maybeSingle();
    if (!repairError && repaired) {
      return hydrateProfile(repaired as Profile);
    }
  }

  return data ? hydrateProfile(data as Profile) : null;
}

/** Persists the user's birth date, which anchors the brain-age calculation. */
export async function saveBirthDate(birthDate: string): Promise<Profile> {
  const { error } = await getSupabase().rpc("set_my_birth_date", {
    p_birth_date: birthDate,
  });

  if (error) {
    const msg = describeError(error, "Save birth date failed");
    logError(msg);
    throw new Error(msg);
  }

  const updated = await fetchProfile();
  if (!updated) {
    throw new Error(
      "Save birth date succeeded, but profile could not be reloaded.",
    );
  }
  return updated;
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
    /* localStorage may be unavailable â€” signOut already handled the session */
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
  const { data: listed } = await getSupabase()
    .storage.from("avatars")
    .list(userId);
  if (listed && listed.length > 0) {
    const stale = listed
      .map((f) => f.name)
      .filter((name) => name !== `avatar.${ext}`)
      .map((name) => `${userId}/${name}`);
    if (stale.length > 0) {
      await getSupabase().storage.from("avatars").remove(stale);
    }
  }

  const { error: upErr } = await getSupabase()
    .storage.from("avatars")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
  if (upErr) {
    throw new Error(describeError(upErr, "Upload avatar failed"));
  }

  const { data: pub } = getSupabase()
    .storage.from("avatars")
    .getPublicUrl(path);
  // Bust CDN/browser cache after overwrite.
  const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { error } = await getSupabase().rpc("set_my_avatar", {
    p_avatar_url: avatarUrl,
  });
  if (error) {
    throw new Error(describeError(error, "Save avatar URL failed"));
  }

  const updated = await fetchProfile();
  if (!updated)
    throw new Error(
      "Save avatar succeeded, but profile could not be reloaded.",
    );
  return updated;
}

/** Remove avatar file(s) for the current user and clear avatar_url. */
export async function removeAvatar(): Promise<Profile> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Remove avatar failed: not authenticated.");

  const { data: listed } = await getSupabase()
    .storage.from("avatars")
    .list(userId);
  if (listed && listed.length > 0) {
    const paths = listed.map((f) => `${userId}/${f.name}`);
    await getSupabase().storage.from("avatars").remove(paths);
  }

  const { error } = await getSupabase().rpc("set_my_avatar", {
    p_avatar_url: null,
  });
  if (error) {
    throw new Error(describeError(error, "Clear avatar URL failed"));
  }

  const updated = await fetchProfile();
  if (!updated)
    throw new Error(
      "Remove avatar succeeded, but profile could not be reloaded.",
    );
  return updated;
}
