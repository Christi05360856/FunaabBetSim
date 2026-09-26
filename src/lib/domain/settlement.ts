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

// Over/Under — now modeled as one market per match holding every goal line
// as its own pair of selections ("over_2.5"/"under_2.5", "over_3.5"/…), so
// settlement resolves every line's winner in one pass instead of needing a
// separate market per line.
export function resolveOverUnderLadderWinners(totalGoals: number, selectionIds: string[]): string[] {
  const winners: string[] = [];
  const lines = new Set<number>();
  for (const id of selectionIds) {
    const match = /^(over|under)_(\d+(?:\.\d+)?)$/.exec(id);
    if (match) lines.add(Number(match[2]));
  }
  for (const line of lines) {
    winners.push(totalGoals > line ? `over_${line}` : `under_${line}`);
  }
  return winners;
}

// Both Teams to Score
export function resolveBTSSelectionId(
  homeScore: number,
  awayScore: number
): "yes" | "no" {
  return homeScore > 0 && awayScore > 0 ? "yes" : "no";
}

// ---- Early ("clinched") settlement from an interim live score ------------
// Goals only ever increase during a match, so some outcomes become
// mathematically locked in before full time — e.g. once the live score
// already totals 4 goals, an Over 3.5 bet has won no matter what happens
// afterward, and Under 3.5 has lost. This is ONLY true in the "already
// happened" direction: a total of 2 goals does NOT mean Under 3.5 has won,
// because more goals can still be scored. Same logic for Both Teams to
// Score: once both sides have scored, "Yes" is locked in; "No" is never
// clinched early, since the team that hasn't scored yet still can.
// Match Winner, Double Chance, Draw No Bet, and Correct Score are never
// safe to clinch early — a scoreline can still change before full time.

/** Only the "over" side of a line can ever be clinched mid-match — never "under". */
export function resolveClinchedOverUnderWinners(currentTotalGoals: number, selectionIds: string[]): string[] {
  const winners: string[] = [];
  for (const id of selectionIds) {
    const match = /^over_(\d+(?:\.\d+)?)$/.exec(id);
    if (!match) continue;
    const line = Number(match[1]);
    if (currentTotalGoals > line) winners.push(id);
  }
  return winners;
}

/** Only "yes" can ever be clinched mid-match — "no" always stays open until full time. */
export function resolveClinchedBTS(currentHomeScore: number, currentAwayScore: number): "yes" | null {
  return currentHomeScore > 0 && currentAwayScore > 0 ? "yes" : null;
}

// Correct Score — an admin only ever offers a finite grid of scorelines
// (e.g. up to 4-3/3-4) plus optional "any other" catch-all buckets. This
// returns the exact scoreline id ("home-away") and, separately, which
// catch-all bucket the result falls into — the caller checks whether the
// exact id was actually offered as a selection on the market and falls
// back to the bucket id if not, so an unlisted score (5-3, 6-0, 7-1…)
// still resolves correctly as long as the "any other" selection exists.
export function resolveCorrectScoreOutcome(
  homeScore: number,
  awayScore: number
): { exactId: string; otherBucketId: "other_home" | "other_away" | "other_draw" } {
  return {
    exactId: `${homeScore}-${awayScore}`,
    otherBucketId: homeScore > awayScore ? "other_home" : awayScore > homeScore ? "other_away" : "other_draw",
  };
}
