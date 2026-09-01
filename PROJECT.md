# Project: Neurobics Dashboard — Comprehensive Audit & Hardening

## Architecture
- **Frontend Architecture**: React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Lucide React. Single Page Application with modular router, game engines, state hooks, and offline queueing.
- **Backend Architecture**: Supabase Edge Functions (Deno/TypeScript) + PostgreSQL with Row-Level Security (RLS) policies, trigger-based XP ledger (`xp_events` -> `profiles.total_xp`), authoritative scoring engine (`_shared/scoring`), multi-tiered anti-cheat engine (`_shared/anticheat`), and feature flag service (`_shared/feature-flags`).
- **Telemetry & Scoring Pipeline**: Client components emit telemetry payloads -> Server validates against Zod `TelemetrySchema` -> Evaluates anti-cheat heuristics -> Calculates multidimensional raw metrics -> Normalizes across 5 cognitive axes -> Updates database ratings & XP ledger via PostgreSQL transactions.
- **Offline Sync & Storage**: Client persists offline rounds to IndexedDB (`mindgem_offline`) -> When online, sync hook batches submissions via `/server/sync-offline-rounds` -> Database processes offline practice sessions with daily XP caps and idempotency constraints.
- **Feature Flags Infrastructure**: Database table `public.feature_flags` with rollout percentage and enabled state -> Edge Functions serve and mutate flags -> Client dynamically gates games and experimental features.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Visual Search Telemetry Alignment | Fix `search-game.tsx` emitting `totalTimeMs` to `timeMs` to satisfy `TelemetrySchema` and avoid 422 errors | M1 | survey |
| 2 | Reaction Time Duration Fix | Replace hardcoded `timeMs: 0` with actual reaction time elapsed in `reaction-game.tsx` | M1 | survey |
| 3 | Cognitive Games Wall-Clock Duration | Standardize `timeMs` across N-Back, Mental Rotation, Corsi, Math Sprint, Schulte, Stroop to prevent false-positive min duration rejections | M1 | survey |
| 4 | Anti-Cheat Math Rule Fix | Fix typo in `inspectMath` checking `"physical"` instead of `"hard"` difficulty | M1 | survey |
| 5 | Telemetry Count Bounds Typo Fix | Fix `assertCountBounds` checking `total` instead of `totalProblems` for Math Sprint | M1 | survey |
| 6 | Database Migration Session Counters | Add missing `search_sessions` increments to `submit_round_transaction` and query views | M1 | survey |
| 7 | Game Edge-Case & State Hardening | Verify all 15 games handle pauses, resets, zero-hit rounds, rapid taps, and unmounts cleanly | M1 | survey |
| 8 | KI-16 Feature Flags Admin UI | Interactive Feature Flags panel inside `AdminPanel` / `ApiIntegrationPanel` with toggle and rollout sliders | M2 | survey |
| 9 | Feature Flags Backend Mutation & Sticky Rollout | Add `POST /server/admin-flags` mutation endpoint and deterministic user-hash rollout logic | M2 | survey |
| 10 | Dynamic Client Feature Flag Gating | Connect `PlayArena.tsx` to dynamic feature flags store to control game visibility | M2 | survey |
| 11 | Guest Upgrade Route & Payload Alignment | Fix `src/app/lib/api/auth.ts` calling `/server/upgrade-account` with `newUsername`, `newPassword`, `newEmail`, `isAdult` | M2 | survey |
| 12 | Missing `serverGet` Helper | Implement and export `serverGet` in `src/app/lib/api/internal.ts` for `adminListProfiles` | M2 | survey |
| 13 | Offline Sync Auto-Trigger Fix | Pass active `userId` to `useOfflineSync` in `src/app/App.tsx` so auto-sync fires on reconnection | M2 | survey |
| 14 | Submission Hook Type Bug Fix | Fix `src/app/hooks/use-round-submission.ts` setting `headline: 0` (number) instead of empty string `""` | M2 | survey |
| 15 | Cognitive Index Calculation Alignment | Ensure `stats.ts` calculation aligns with database views and scoring requirements | M2 | survey |
| 16 | Elimination of `@ts-nocheck` | Remove all 13 `@ts-nocheck` headers and fix all underlying TypeScript compile errors | M3 | survey |
| 17 | ESLint Zero-Warning / Zero-Error Cleanliness | Fix all ESLint violations and remove blanket disable comments | M3 | survey |
| 18 | React Memoization & Render Loop Prevention | Memoize `cognitiveData` and `levelProgress` in `AppRouter.tsx` and optimize hooks | M3 | survey |
| 19 | Production Build & Bundle Optimization | Verify clean Vite production build, chunk splitting, and bundle size constraints | M3 | survey |
| 20 | Test Suite Remediation (Concurrency & Guest) | Replace dummy `expect(true).toBe(true)` tests with genuine concurrency and guest submission tests | M4 | survey |
| 21 | Comprehensive Opaque-Box E2E Test Suite | 4-Tier test suite covering Feature Coverage, Boundary/Corner Cases, Cross-Feature Combinations, and Real-World Scenarios | M4 | survey |
| 22 | White-Box Adversarial Coverage Hardening (Tier 5) | Adversarial test generation, edge-case probing, and verification across all modules | M5 | survey |
| 23 | Final End-to-End Verification & Forensic Audit | 100% test pass, clean typecheck, clean ESLint, clean production build, zero audit violations | M5 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Cognitive & Arcade Games Logic & Telemetry Bug Fixes | Features 1-7: Telemetry contracts, timing standardizations, anti-cheat typos, bounds checks, session counters | none | DONE |
| M2 | Architecture, Integrations, Auth & Tech Debt (KI-16) | Features 8-15: Feature flags admin UI & backend mutation, auth guest upgrade, `serverGet`, offline auto-sync, submission types | none | DONE |
| M3 | Code Quality, TypeScript Strictness, ESLint & Optimization | Features 16-19: Remove `@ts-nocheck`, fix all TS errors, clean ESLint, memoization, production build | M1, M2 | IN_PROGRESS |
| M4 | Comprehensive E2E & Regression Test Suite | Features 20-21: Test hardening, 4-tier opaque-box E2E test suite (`TEST_READY.md`) | M1, M2, M3 | PLANNED |
| M5 | Final E2E Pass, Adversarial Hardening (Tier 5) & Audit | Features 22-23: Pass 100% E2E tests, Tier 5 adversarial verification, forensic integrity audit | M4 | PLANNED |

## Interface Contracts
### Client Telemetry ↔ Server Scoring
- `TelemetrySchema`: `{ timeMs: number (> 0), ...gameSpecificFields }`
- Client must always send `timeMs` representing positive elapsed round duration in milliseconds.
- Visual Search: `{ timeMs, foundCount, totalRounds, wrongClicks, avgRtMs }`
- Reaction Time: `{ timeMs: reactionTimeMs, attempts, falseStarts, rawRts }`

### Feature Flags Admin ↔ Server Flags Endpoint
- `GET /server/flags` -> `{ [key: string]: { enabled: boolean, rollout_percentage: number } }`
- `POST /server/admin-flags` -> Body: `{ key: string, enabled: boolean, rolloutPercentage: number }` -> Response: `{ success: true, flag: FeatureFlag }`

### Auth Client ↔ Server Account Upgrade
- `POST /server/upgrade-account` -> Body: `{ newUsername, newPassword, newEmail, isAdult }` -> Response: `{ session, profile }`

### Client Internal API
- `serverGet<T>(endpoint: string, headers?: Record<string, string>): Promise<T>`
- `serverPost<T>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T>`

## Code Layout
- `src/app/games/`: All 15 cognitive & arcade game implementations
- `src/app/components/`: UI components (AdminPanel, PlayArena, RadarChart, etc.)
- `src/app/hooks/`: React hooks (`useRoundSubmission`, `useOfflineSync`, `useFeatureFlags`, etc.)
- `src/app/lib/api/`: API client modules (`auth.ts`, `admin.ts`, `rounds.ts`, `flags.ts`, `internal.ts`, `stats.ts`)
- `src/app/lib/`: Utilities (`offline-queue.ts`, `game-registry.ts`, `sound.ts`, etc.)
- `supabase/functions/server/`: Edge Function routes and server entry points
- `supabase/functions/_shared/`: Shared scoring algorithms, anti-cheat heuristics, schemas, feature flags
- `supabase/migrations/`: PostgreSQL schema migrations and stored procedures
- `tests/`: Unit, integration, fuzz, and edge-case test suites
- `e2e/`: End-to-end Playwright test suites
