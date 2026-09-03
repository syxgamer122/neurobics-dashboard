# E2E Test Infra: Neurobics Dashboard

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Visual Search Game & Telemetry | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 2 | Reaction Time Game & Telemetry | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 3 | N-Back, Stroop, Schulte, Corsi, Memory, Math, Mental Rotation | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 4 | Dino, Flappy, Snake, Sudoku, Go/No-Go, Trail | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 5 | Anti-Cheat & Heuristics Validation | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 6 | Scoring Engines & Provisional Rating | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 7 | KI-16 Feature Flags Admin UI & Toggle | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 8 | Supabase Auth & Guest Upgrade | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 9 | Offline Queue & Sync Batching | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 10 | XP Ledger & Idempotency | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 11 | Performance & Bundle Constraints | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: Vitest (`pnpm test` / `pnpm vitest run`) + Playwright E2E (`pnpm test:e2e` / `npx playwright test`)
- Pass/Fail Semantics: 100% assertions passing with exit code 0.
- Directory Layout:
  - `tests/`: Unit, edge-case, and fuzzing test suites
  - `e2e/`: Opaque-box E2E test specs (Tiers 1-4)
  - `tests/fixtures/`: Deterministic test fixtures and telemetry payloads

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complete Daily Cognitive Training Workflow | Games, Scoring, XP Ledger, Streaks, Quests | High |
| 2 | Offline Practice and Reconnect Sync | Offline Queue, IndexedDB, Web Locks, Batch Sync, Daily Caps | High |
| 3 | Guest Player Upgrade to Registered Account | Guest Auth, Profile Migration, Password Hash, Upgrade RPC | Medium |
| 4 | Admin Feature Flag Rollout & Gating Lifecycle | Admin UI, Flag API, Sticky Rollout, Game Arena Visibility | High |
| 5 | Anti-Cheat Heuristics Flagging & Bot Defense | Rapid Tap Bot, Impossible RT, Math Telemetry Tampering | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (Total ≥ 55 test cases)
- Tier 2: ≥5 per feature boundary cases (Total ≥ 55 test cases)
- Tier 3: Pairwise coverage across major feature interactions (Total ≥ 15 test cases)
- Tier 4: ≥5 realistic end-to-end application scenarios
- Tier 5: White-box adversarial coverage hardening
