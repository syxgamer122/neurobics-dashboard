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
  PROFILE_COLS,
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  type Profile,
} from "./internal";
import { logError } from "../logger";

function isSchemaCacheMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  return (
    e.code === "PGRST202" ||
    /schema cache|could not find the function|function .* does not exist/i.test(
      e.message ?? "",
    )
  );
}

export async function fetchProfile(): Promise<Profile | null> {
  const supabase = getSupabase();

  // 1. First attempt: canonical secure RPC get_my_profile()
  const { data, error } = await supabase.rpc("get_my_profile").maybeSingle();

  if (!error && data) {
    return hydrateProfile(data as Profile);
  }

  // If RPC is missing from remote schema cache (migration not applied yet)
  if (error && isSchemaCacheMissing(error)) {
    const userId = await currentUserId();
    if (!userId) return null;

    // Fallback 1: read from profiles_decayed view
    const viewRes = await supabase
      .from("profiles_decayed")
      .select(PROFILE_COLS)
      .eq("id", userId)
      .maybeSingle();

    if (!viewRes.error && viewRes.data) {
      return hydrateProfile(viewRes.data as Profile);
    }

    // Fallback 2: read from profiles table directly
    const tableRes = await supabase
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", userId)
      .maybeSingle();

    if (!tableRes.error && tableRes.data) {
      return hydrateProfile(tableRes.data as Profile);
    }

    if (tableRes.error) {
      const msg = describeError(
        tableRes.error,
        "Fetch profile fallback failed",
      );
      logError(msg);
      throw new Error(msg);
    }
  }

  if (error && !isSchemaCacheMissing(error)) {
    const msg = describeError(error, "Fetch profile failed");
    logError(msg);
    throw new Error(msg);
  }

  if (!data) {
    // Attempt idempotent profile repair if session is active but profile was missing
    const { data: repaired, error: repairError } = await supabase
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
  const supabase = getSupabase();
  const { error } = await supabase.rpc("set_my_birth_date", {
    p_birth_date: birthDate,
  });

  if (error) {
    if (isSchemaCacheMissing(error)) {
      const userId = await currentUserId();
      if (!userId)
        throw new Error("Save birth date failed: not authenticated.");
      const year = parseInt(birthDate.slice(0, 4), 10);
      const { error: directErr } = await supabase
        .from("profiles")
        .update({ birth_date: birthDate, birth_year: year })
        .eq("id", userId);
      if (directErr) {
        throw new Error(describeError(directErr, "Save birth date failed"));
      }
    } else {
      const msg = describeError(error, "Save birth date failed");
      logError(msg);
      throw new Error(msg);
    }
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
    if (isSchemaCacheMissing(error)) {
      const { error: directErr } = await getSupabase()
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);
      if (directErr) {
        throw new Error(describeError(directErr, "Save avatar URL failed"));
      }
    } else {
      throw new Error(describeError(error, "Save avatar URL failed"));
    }
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
    if (isSchemaCacheMissing(error)) {
      const { error: directErr } = await getSupabase()
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);
      if (directErr) {
        throw new Error(describeError(directErr, "Clear avatar URL failed"));
      }
    } else {
      throw new Error(describeError(error, "Clear avatar URL failed"));
    }
  }

  const updated = await fetchProfile();
  if (!updated)
    throw new Error(
      "Remove avatar succeeded, but profile could not be reloaded.",
    );
  return updated;
}
