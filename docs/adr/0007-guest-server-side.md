# ADR 0007: Guest Server-Side Provisioning

**Status**: Accepted (Supersedes ADR 0001)

## Context
In ADR 0001, we implemented a client-side fake-email generator that stored a random password in IndexedDB. This "Guest Local" mode allowed users to play immediately without signing up, computing scores entirely in the browser. 

However, this architecture caused several issues:
1. **Security/Abuse**: The `/server/submit-round` endpoint had to conditionally bypass JWT validation for guest IDs, making it an open door for spoofing.
2. **Duplicate Logic**: We had to maintain duplicate scoring algorithms in `src/app/lib/guest.ts` and `supabase/functions/server/routes/scoring.ts`.
3. **Complexity**: Transitioning a "Guest Local" to a full account required migrating local data to the server, resolving conflicts, and replaying telemetry.

## Decision
We decided to adopt a **True Auth Server-Side Provisioning** model for guests:
- Guests are now provisioned by calling `/server/signup` with an empty payload. 
- The Edge Function generates a secure random UUID-based email and strong password.
- The signup request is protected by Cloudflare Turnstile to prevent bot abuse.
- The guest logs in through the standard Supabase Auth flow, receiving a standard JWT.
- A `role` column in `profiles` is set to `'guest'`.
- Guest plays are routed through the exact same `/server/submit-round` endpoint as authenticated users.

## Consequences
- **Positive**: Removed all client-side scoring logic (`guest.ts`). 
- **Positive**: Closed the unauthenticated endpoint loophole; all requests now require a valid JWT.
- **Positive**: Transitioning to a real account only requires an `UPDATE profiles SET role = 'user'` (plus changing the email/password via Supabase Auth), rather than migrating data.
- **Negative**: Guests must be online to initiate their first session (to get the JWT). 
