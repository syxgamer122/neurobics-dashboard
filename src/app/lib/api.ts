/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/**
 * Public API surface. Implementation lives in ./api/*; this file only re-exports
 * so every existing `from "../lib/api"` import keeps working unchanged.
 */
export const isGuestProfile = (p: any) => p?.role === "guest";

export {
  getSupabase,
  getAccessToken,
  currentUserId,
  isNetworkErrorLike,
  type Profile,
} from "./api/internal";

export {
  USERNAME_RE,
  normalizeUsername,
  assertValidUsername,
  AUTH_EMAIL_DOMAIN,
  LEGACY_AUTH_EMAIL_DOMAINS,
  handleGuestSignUp,
  handleSignUp,
  handleLogin,
  handleLogout,
  handleUpgradeGuest,
} from "./api/auth";
export {
  fetchProfile,
  saveBirthDate,
  deleteActiveUserAccount,
  changePassword,
  uploadAvatar,
  removeAvatar,
} from "./api/profile";
export {
  adminFetchUser,
  adminApplyGrant,
  adminAddPoints,
  adminResetScores,
  adminDeleteUser,
  type AdminGrant,
} from "./api/admin";
export {
  startRound,
  submitRound,
  syncOfflineRounds,
  type RoundGame,
  type RoundTicket,
  type SubmittedRound,
} from "./api/rounds";
export {
  cognitiveIndex,
  COVERAGE_FLOOR,
  axesCovered,
  LEADERBOARD_FALLBACK_LIMIT,
  POPULATION_FALLBACK_LIMIT,
  dataQuality,
  fetchLeaderboard,
  fetchPopulationStats,
  fetchActivityStats,
  type DataQuality,
  type ActivityStats,
} from "./api/stats";
export {
  fetchTrainingHistory,
  fetchPersonalBests,
  schulteBestMapKey,
  fetchSchulteConfigBests,
  fetchProgressSeries,
  type TrainingSession,
  type PersonalBest,
  type SchulteConfigBest,
  type SchulteBestKey,
  type ProgressPoint,
} from "./api/history";
export {
  syncAchievements,
  fetchAchievementProgress,
  fetchDailyQuests,
  claimQuest,
  type AchievementUnlock,
  type AchievementProgress,
  type DailyQuest,
} from "./api/gamification";
export {
  searchPlayers,
  fetchFriends,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  fetchFriendLeaderboard,
  type PlayerSearchResult,
  type FriendEntry,
  type FriendRank,
} from "./api/social";

// The rating scale and its guards live in ./provisional-score, the single source of truth
// for everything score-related. Re-exported so existing importers keep working.
export { RATING_MAX, sanitizeRating } from "./provisional-score";
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
