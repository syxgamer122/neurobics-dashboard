# Adding a game to MindGem

MindGem uses typed registries so a missing integration fails during tests or typecheck instead of appearing later in production.

## 1. Client catalog

Add one entry to `src/app/lib/game-registry.ts`:

- `id`
- display `title`, `accent`, `icon`
- `tagKey` and `descriptionKey`
- primary and secondary cognitive axes
- profile `sessionColumn`
- stage width

`GameId`, `GAME_IDS`, `GAME_BY_ID` and `SESSION_COLUMNS` are derived automatically. Do not create another game-id union or metadata map.

## 2. Game UI adapter

Create the game component under `src/app/games/`, then add one adapter entry to `GAME_COMPONENTS` in `components/app/play-arena.tsx`.

The arena tiles, title, accent, stage width and i18n text come from the client catalog automatically.

## 3. Server scoring

Add a scorer and register it in `SCORERS` inside `supabase/functions/_shared/round-scoring.ts`.

Add the id to server `GAME_IDS` in `scoring/core.ts`. The exhaustive `Record<Game, ...>` type forces every game to have a scorer.

## 4. Anti-cheat and validation

Add an inspector to `GAME_INSPECTORS` in `_shared/anticheat.ts`. The exhaustive registry forces coverage.

Add a Zod telemetry schema to `TelemetrySchema` inside `supabase/functions/_shared/scoring/schema.ts` to strictly validate payload structure from the client.

Add telemetry count/bound checks in `_shared/scoring/validation.ts` when the game has game-specific invariants.

## 5. Database migration

Database constraints stay explicit on purpose. Create a new migration that updates:

- `profiles.<game>_sessions`
- `training_sessions.game` check constraint
- `round_tickets.game` check constraint
- `xp_events.game` check constraint when applicable
- `submit_round_transaction`
- population/history RPCs that enumerate session columns

Never weaken a SQL check constraint just to make deployment easier.

## 6. Guest, history, profile and admin

No manual game list is needed. These derive from the client registry:

- guest session counter
- total sessions
- profile selects and score reset
- history cards and filters
- result overlay metadata
- admin session totals

## 7. i18n

Add the `tagKey` and `descriptionKey` to both `i18n/vi.ts` and `i18n/en.ts`. The registry parity audit verifies both languages.

## 8. Bump Version Constants

Theo `version-policy.md`, khi thêm game mới hoặc sửa đổi telemetry, bạn BẮT BUỘC phải quản lý phiên bản các hằng số:
- `SCORERS_BY_VERSION`: Khai báo phiên bản công thức tính điểm cho game mới (`new_game: 1`). **KHÔNG** tăng phiên bản của các game cũ (Per-Scorer Versioning).
- `INSPECTOR_VERSIONS[game]`: Tăng lên nếu có thay đổi ngưỡng anti-cheat riêng cho game này. Tăng `SHARED_INSPECTOR_VERSION (xem version-policy.md)` nếu đổi luật chung.
- `TELEMETRY_SCHEMA_VERSION`: Tăng lên nếu shape/dữ liệu của telemetry truyền lên bị thay đổi.

## 9. Tests

Add honest, invalid, exploit and anti-cheat cases to `tests/sim-games.ts`.

Run:

```powershell
pnpm run db:lint
supabase db start
pnpm run typecheck
pnpm run scan
pnpm run test:sim
pnpm run test
pnpm run build
```

`tests/sim-audit.ts` verifies:

- unique game ids
- unique and correctly named session columns
- valid primary/secondary axes
- vi/en registry keys
- exact client/server game-id parity
- both runtime type guards

## 10. Deploy

Run the SQL migration before deployment, then deploy the server function:

```powershell
npx supabase functions deploy server --project-ref <YOUR_PROJECT_REF>
```
