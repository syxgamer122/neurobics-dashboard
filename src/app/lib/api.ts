/**
 * Public API surface. Implementation lives in ./api/*; this file only re-exports
 * so every existing `from "../lib/api"` import keeps working unchanged.
 */
export { getSupabase, getAccessToken, type Profile } from "./api/internal";

export * from "./api/auth";
export * from "./api/profile";
export * from "./api/admin";
export * from "./api/rounds";
export * from "./api/stats";
export * from "./api/history";
export * from "./api/gamification";
export * from "./api/social";

// The rating scale and its guards live in ./scoring, the single source of truth
// for everything score-related. Re-exported so existing importers keep working.
export { RATING_MAX, sanitizeRating } from "./scoring";
export { AXIS_COLUMNS, AXIS_META, type AxisKey } from "./axes";
export { SESSION_COLUMNS, totalSessions } from "./sessions";
export {
  GAME_REGISTRY,
  GAME_IDS,
  GAME_BY_ID,
  isGameId,
  gameStageClass,
  type GameId,
  type GameDefinition,
  type SessionColumn,
} from "./game-registry";
