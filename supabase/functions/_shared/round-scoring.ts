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

export { GAME_IDS, isGame } from "./scoring/core.ts";
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
  if (
    !Number.isFinite(serverElapsedMs) ||
    serverElapsedMs < 500 ||
    serverElapsedMs > 2 * 60 * 60 * 1000
  ) {
    throw new AppError("Round duration is invalid or expired", 422, "invalid_duration");
  }

  assertCountBounds(game, telemetry);
  assertRtBounds(
    (telemetry as { rts?: unknown } | null)?.rts,
    serverElapsedMs,
    game,
  );

  const scored = SCORERS[game](asTelemetry(telemetry));
  // Client time may exclude fixed animations/waits, but cannot exceed server by >15s.
  if (scored.timeMs > serverElapsedMs + 15_000) {
    throw new AppError("Telemetry time exceeds server round time", 422, "invalid_duration");
  }
  return scored;
}
