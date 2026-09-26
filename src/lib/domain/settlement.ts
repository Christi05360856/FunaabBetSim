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

// Double Chance (1X, 12, X2)
export function resolveDoubleChanceSelectionId(
  homeScore: number,
  awayScore: number
): "home_draw" | "home_away" | "draw_away" {
  if (homeScore > awayScore) return "home_away"; // Home or Away wins
  if (awayScore > homeScore) return "home_away"; // Home or Away wins
  return "home_draw"; // Draw
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
