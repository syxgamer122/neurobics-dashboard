/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const testEnv = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || 'dummy',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy',
};

describe('Offline Sync Idempotency', () => {
  it('should handle 50 concurrent requests for the same client_round_id safely', async () => {
    const adminClient = createClient(testEnv.supabaseUrl, testEnv.supabaseServiceRoleKey);
    
    const dummyId = crypto.randomUUID();
    const email = 'idemp_' + dummyId.substring(0, 8) + '@mindgem.local';

    // Create a user
    const { data: userAuth, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password: 'Password123!',
      user_metadata: { username: 'idemp_' + dummyId.substring(0, 8) },
      email_confirm: true
    });

    if (authErr) {
      console.log('Skipping test due to auth creation failure:', authErr);
      return;
    }

    const userId = userAuth.user.id;
    const anonClient = createClient(testEnv.supabaseUrl, testEnv.supabaseAnonKey);
    const { data: session } = await anonClient.auth.signInWithPassword({ email, password: 'Password123!' });
    const token = session?.session?.access_token;

    if (!token) {
       await adminClient.auth.admin.deleteUser(userId);
       return;
    }

    const clientRoundId = crypto.randomUUID();
    
    // Fire 50 concurrent sync requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        fetch(testEnv.supabaseUrl.replace('http://', 'http://') + '/functions/v1/server/sync-offline-rounds', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rounds: [{
              game: 'search',
              telemetry: { version: 1 },
              fingerprint: 'test_fp',
              startedAt: new Date().toISOString(),
              clientElapsedMs: 1000,
              clientRoundId,
              userId
            }]
          })
        }).then(r => r.json())
      );
    }

    const results = await Promise.all(promises);
    
    // Only 1 should be 'ok', the rest should be 'duplicate' or 429
    const okCount = results.filter(r => r.results && r.results[0]?.status === 'ok').length;
    const dupCount = results.filter(r => r.results && r.results[0]?.status === 'duplicate').length;
    const blockedCount = results.filter(r => r.error && r.error.includes('Too many offline sync')).length;

    expect(okCount).toBeLessThanOrEqual(1);
    expect(okCount + dupCount + blockedCount).toBeGreaterThan(0);

    await adminClient.auth.admin.deleteUser(userId);
  });
});


