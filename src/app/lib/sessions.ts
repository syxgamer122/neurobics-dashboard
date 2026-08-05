import { SESSION_COLUMNS, type SessionColumn } from "./game-registry.ts";

/** Session counters are derived from the canonical Game Registry. */
export { SESSION_COLUMNS, type SessionColumn };

/** Sum of all game session counters on a profile-like object. */
export function totalSessions(
  profile:
    | Partial<Record<SessionColumn, number | null | undefined>>
    | null
    | undefined,
): number {
  if (!profile) return 0;
  let total = 0;
  for (const column of SESSION_COLUMNS) total += profile[column] ?? 0;
  return total;
}
