/**
 * Resolves a Match Winner selection against a final score. Pure function —
 * no database, no side effects — which is exactly why it's trivial to test
 * and safe to reuse from inside a Firestore transaction later.
 */
export function resolveMatchWinnerSelectionId(
  homeScore: number,
  awayScore: number
): "home" | "draw" | "away" {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}
