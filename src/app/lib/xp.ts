/**
 * XP and Level system — separate from skill ratings (0-1000).
 * XP measures engagement; Level is derived from total XP.
 */

export const MAX_XP_PER_ROUND = 35;
// Daily XP cap enforced server-side only.

/** XP needed to reach a given level (cumulative). */
export function xpRequiredForLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return 50 * (L - 1) * L;
}

/** Derive current level from total XP. */
export function levelFromXp(totalXp: number): number {
  const xp = Math.max(0, totalXp);
  const completed = Math.floor((-1 + Math.sqrt(1 + xp / 12.5)) / 2);
  return completed + 1;
}

/** Full level progress info for UI display. */
export function getLevelProgress(totalXp: number) {
  const level = levelFromXp(totalXp);
  const currentThreshold = xpRequiredForLevel(level);
  const nextThreshold = xpRequiredForLevel(level + 1);
  const xpIntoLevel = Math.max(0, totalXp - currentThreshold);
  const xpNeeded = nextThreshold - currentThreshold;

  return {
    level,
    totalXp,
    currentThreshold,
    nextThreshold,
    xpIntoLevel,
    xpNeeded,
    progress: xpNeeded > 0 ? xpIntoLevel / xpNeeded : 0,
  };
}

/** Title shown next to the level number. */
export function getLevelTitle(level: number): string {
  if (level >= 50) return "Neuro Sage";
  if (level >= 35) return "Neural Master";
  if (level >= 20) return "Strategist";
  if (level >= 10) return "Thinker";
  if (level >= 5) return "Explorer";
  return "Novice";
}

/** Title color for UI. */
export function getLevelColor(level: number): string {
  if (level >= 50) return "#F43F5E";
  if (level >= 35) return "#F59E0B";
  if (level >= 20) return "#A855F7";
  if (level >= 10) return "#00D4FF";
  if (level >= 5) return "#10B981";
  return "#94A3B8";
}

/** XP earned for a single round, based on round score (0-1000). */
export function calculateRoundXp(roundScore: number): number {
  const score = Math.max(0, Math.min(1000, Math.round(roundScore)));
  const performanceBonus = Math.floor(score / 50);
  return Math.min(MAX_XP_PER_ROUND, 15 + performanceBonus);
}
