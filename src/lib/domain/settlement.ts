/**
 * Resolves selections against final scores for all market types.
 * Pure functions — no database, no side effects.
 */

// Match Winner (1X2)
export function resolveMatchWinnerSelectionId(
  homeScore: number,
  awayScore: number
): "home" | "draw" | "away" {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

// Double Chance (1X, 12, X2) — two of the three selections win on every
// result (e.g. a home win pays both "1X" and "12"), so this returns every
// winning selection id, not just one.
export function resolveDoubleChanceSelectionIds(
  homeScore: number,
  awayScore: number
): ("home_draw" | "home_away" | "draw_away")[] {
  if (homeScore > awayScore) return ["home_draw", "home_away"]; // home win: 1X + 12
  if (awayScore > homeScore) return ["home_away", "draw_away"]; // away win: 12 + X2
  return ["home_draw", "draw_away"]; // draw: 1X + X2
}

// Draw No Bet (refund on draw)
export function resolveDrawNoBetSelectionId(
  homeScore: number,
  awayScore: number
): "home" | "away" | "refund" {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "refund"; // Draw = refund
}

// Over/Under
export function resolveOverUnderSelectionId(
  homeScore: number,
  awayScore: number,
  line: number
): "over" | "under" {
  const totalGoals = homeScore + awayScore;
  return totalGoals > line ? "over" : "under";
}

// Both Teams to Score
export function resolveBTSSelectionId(
  homeScore: number,
  awayScore: number
): "yes" | "no" {
  return homeScore > 0 && awayScore > 0 ? "yes" : "no";
}
