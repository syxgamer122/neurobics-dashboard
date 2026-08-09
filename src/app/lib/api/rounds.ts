/**
 * Round lifecycle: ticket types, start-round and submit-round.
 */
import {
  sanitizeProfile,
  serverPost,
  deviceFingerprint,
  type Profile,
} from "./internal";
import type { GameId } from "../game-registry";

// ─── XP awarding (server-side, tamper-resistant) ──────────────────────────────

/** Backward-compatible API name; canonical type comes from Game Registry. */
export type RoundGame = GameId;
export type RoundTicket = {
  roundId: string;
  game: RoundGame;
  startedAt: string;
  expiresAt: string;
};
export type SubmittedRound = {
  profile: Profile;
  axes: {
    speed: number | null;
    focus: number | null;
    spatial: number | null;
    logic: number | null;
    memory: number | null;
  };
  headline: number;
  label: string;
  timeMs: number;
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
};

/** Obtain a short-lived, one-use round ticket before play. */
export const startRound = (game: RoundGame): Promise<RoundTicket> =>
  serverPost<RoundTicket>("start-round", { game });

/** One finish request: server scores telemetry and atomically saves everything. */
export async function submitRound(
  roundId: string,
  game: RoundGame,
  telemetry: unknown,
): Promise<SubmittedRound> {
  const result = await serverPost<SubmittedRound>("submit-round", {
    roundId,
    game,
    telemetry,
    fingerprint: deviceFingerprint(),
  });
  return { ...result, profile: sanitizeProfile(result.profile) };
}

export async function syncOfflineRounds(payload: { rounds: any[] }): Promise<{ results: any[] }> {
  return serverPost<{ results: any[] }>("sync-offline-rounds", payload);
}
