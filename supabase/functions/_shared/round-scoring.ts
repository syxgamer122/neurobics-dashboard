// @ts-nocheck
// Server-side source of truth for round validation and cognitive scoring.
import { asTelemetry } from "./scoring/core.ts";
import type { Game, ScoredRound, Telemetry } from "./scoring/core.ts";
import { AppError } from "./errors.ts";
import {
  scoreMath,
  scoreMemory,
  scoreReaction,
  scoreSchulte,
  scoreStroop,
  scoreSudoku,
} from "./scoring/standard-games.ts";
import {
  scoreCorsi,
  scoreGoNoGo,
  scoreMentalRotation,
  scoreNBack,
  scoreTrail,
  scoreSearch,
} from "./scoring/advanced-games.ts";
import { assertCountBounds, assertRtBounds } from "./scoring/validation.ts";
import { parseTelemetry } from "./scoring/schema.ts";

export { GAME_IDS, isGame, getGameStatus, SCORER_VERSIONS, TELEMETRY_SCHEMA_VERSION } from "./scoring/core.ts";
export type {
  Game,
  AxisRatings,
  ScoredRound,
  Telemetry,
} from "./scoring/core.ts";

const SCORERS = {
  schulte: scoreSchulte,
  sudoku: scoreSudoku,
  stroop: scoreStroop,
  reaction: scoreReaction,
  memory: scoreMemory,
  nback: scoreNBack,
  math: scoreMath,
  gonogo: scoreGoNoGo,
  mental: scoreMentalRotation,
  corsi: scoreCorsi,
  trail: scoreTrail,
  search: scoreSearch,
} satisfies Record<Game, (telemetry: Telemetry) => ScoredRound>;

export function scoreAndValidate(
  game: Game,
  telemetry: unknown,
  serverElapsedMs: number,
): ScoredRound {
  // 1. Zod Schema Validation
  const parsedTelemetry = parseTelemetry(game, telemetry);

  if (
    !Number.isFinite(serverElapsedMs) ||
    serverElapsedMs < 500 ||
    serverElapsedMs > 2 * 60 * 60 * 1000
  ) {
    throw new AppError(
      "Round duration is invalid or expired",
      422,
      "invalid_duration",
    );
  }

  // 2. Bounds Validation
  assertCountBounds(game, parsedTelemetry);
  const t = parsedTelemetry as Record<string, unknown>;
  assertRtBounds(
    t.rts ?? t.hitRts ?? t.moveRts,
    serverElapsedMs,
    game,
  );

  // 3. Scoring
  const scored = SCORERS[game](asTelemetry(parsedTelemetry));
  // Client time may exclude fixed animations/waits, but cannot exceed server by >15s.
  if (scored.timeMs > serverElapsedMs + 15_000) {
    throw new AppError(
      "Telemetry time exceeds server round time",
      422,
      "invalid_duration",
    );
  }
  return scored;
}
