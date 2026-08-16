import { z } from "npm:zod@3.22.4";
import type { Game } from "./core.ts";
import { AppError } from "../errors.ts";

// Helper for arrays of positive numbers (reaction times)
const rtsSchema = z.array(z.number().nonnegative().finite()).max(5000).optional();
const countSchema = z.number().nonnegative().finite().optional();

// We define a flexible base schema that validates the structure of known fields,
// rather than being excessively strict, to allow forward-compatibility with client updates,
// while strictly defending against injection or invalid types.
export const TelemetrySchema = z.object({
  timeMs: z.number().positive().finite(),
  failed: z.boolean().optional(),
  
  // Arrays of RTs
  rts: rtsSchema,
  hitRts: rtsSchema,
  moveRts: rtsSchema,
  
  // Standard Counts
  wrongClicks: countSchema,
  mistakes: countSchema,
  correct: countSchema,
  wrong: countSchema,
  total: countSchema,
  hits: countSchema,
  misses: countSchema,
  falseAlarms: countSchema,
  falseStarts: countSchema,
  totalStimuli: countSchema,
  trials: countSchema,
  targets: countSchema,
  maxLevel: countSchema,
  goTrials: countSchema,
  nogoTrials: countSchema,
  correctRejections: countSchema,
  span: countSchema,
  correctTrials: countSchema,
  taps: countSchema,
  nodes: countSchema,
  placements: countSchema,
  reEntries: countSchema,
  repeatMistakes: countSchema,
  actualClues: countSchema,

  // Specific Game Params
  cells: z.number().int().optional(),
  difficulty: z.string().optional(),
  modeLabel: z.string().optional(),
  mode: z.string().optional(),
}).passthrough(); // Allow unknown fields to pass through safely without crashing

export function parseTelemetry(game: Game, raw: unknown): z.infer<typeof TelemetrySchema> {
  const result = TelemetrySchema.safeParse(raw);
  if (!result.success) {
    // Log the Zod error for internal observability, but return a clean AppError
    console.error(`Telemetry validation failed for ${game}:`, result.error.format());
    throw new AppError("Invalid telemetry format", 422, "invalid_telemetry");
  }
  return result.data;
}
