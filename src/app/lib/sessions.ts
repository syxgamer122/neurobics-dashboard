/** Single source: profile session counters for every game. */
export const SESSION_COLUMNS = [
  "schulte_sessions",
  "sudoku_sessions",
  "stroop_sessions",
  "reaction_sessions",
  "memory_sessions",
  "nback_sessions",
  "math_sessions",
] as const;

export type SessionColumn = (typeof SESSION_COLUMNS)[number];

/** Sum of all game session counters on a profile-like object. */
export function totalSessions(
  p: Partial<Record<SessionColumn, number | null | undefined>> | null | undefined,
): number {
  if (!p) return 0;
  let n = 0;
  for (const col of SESSION_COLUMNS) n += p[col] ?? 0;
  return n;
}
