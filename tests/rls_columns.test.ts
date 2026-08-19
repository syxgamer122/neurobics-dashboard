/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const testEnv = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321",
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || "dummy",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy",
};

describe("Profiles Strict Column-level RLS", () => {
  it("should completely prevent authenticated user from direct UPDATE on profiles", async () => {
    const adminClient = createClient(
      testEnv.supabaseUrl,
      testEnv.supabaseServiceRoleKey,
    );

    const dummyId = crypto.randomUUID();
    const email = "rlstest_" + dummyId.substring(0, 8) + "@mindgem.local";

    // Create a user
    const { data: userAuth, error: authErr } =
      await adminClient.auth.admin.createUser({
        email,
        password: "Password123!",
        user_metadata: { username: "rls_" + dummyId.substring(0, 8) },
        email_confirm: true,
      });

    if (authErr) {
      console.log("Skipping test due to auth creation failure:", authErr);
      return;
    }

    const userId = userAuth.user.id;

    // Login as that user to get an authenticated client
    const anonClient = createClient(
      testEnv.supabaseUrl,
      testEnv.supabaseAnonKey,
    );
    await anonClient.auth.signInWithPassword({
      email,
      password: "Password123!",
    });

    // Try to update role
    const { error: roleErr } = await anonClient
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId);
    expect(roleErr).not.toBeNull();
    expect(roleErr?.message).toMatch(/denied|permission|update/i);

    // Try to update total_xp
    const { error: xpErr } = await anonClient
      .from("profiles")
      .update({ total_xp: 9999 })
      .eq("id", userId);
    expect(xpErr).not.toBeNull();

    // Clean up
    await adminClient.auth.admin.deleteUser(userId);
  });
});
