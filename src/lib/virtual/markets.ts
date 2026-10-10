/**
 * Instant Virtual markets — client-safe (no server-only).
 * One place that knows which markets exist, their picks, labels, and how a
 * pick is judged. The server (settle) and the screens both use legWins(), so
 * what the player sees and what gets paid can never disagree.
 */

export type MarketId =
  | "1x2"
  | "1up"
  | "2up"
  | "dc"
  | "ou15"
  | "ou25"
  | "ou35"
  | "btts";

export const MARKET_IDS: MarketId[] = [
  "1x2",
  "1up",
  "2up",
  "dc",
  "ou15",
  "ou25",
  "ou35",
  "btts",
];

export const MARKET_PICKS: Record<MarketId, string[]> = {
  "1x2": ["home", "draw", "away"],
  "1up": ["home", "draw", "away"],
  "2up": ["home", "draw", "away"],
  dc: ["1x", "12", "x2"],
  ou15: ["over", "under"],
  ou25: ["over", "under"],
  ou35: ["over", "under"],
  btts: ["yes", "no"],
};

/** Short market name shown under a ticket leg (like "O/U" on the ticket). */
export const MARKET_TITLE: Record<MarketId, string> = {
  "1x2": "1X2",
  "1up": "1X2 - 1UP",
  "2up": "1X2 - 2UP",
  dc: "Double Chance",
  ou15: "O/U",
  ou25: "O/U",
  ou35: "O/U",
  btts: "GG/NG",
};

export const OU_LINES: Array<{ id: MarketId; line: number }> = [
  { id: "ou15", line: 1.5 },
  { id: "ou25", line: 2.5 },
  { id: "ou35", line: 3.5 },
];

export function ouLine(id: string): number | null {
  return OU_LINES.find((x) => x.id === id)?.line ?? null;
}

export function isMarketId(x: string): x is MarketId {
  return (MARKET_IDS as string[]).includes(x);
}

/** Text for a pick, e.g. "Over 1.5", "Home or Draw", "Home". */
export function pickText(market: string, pick: string): string {
  if (market === "1x2" || market === "1up" || market === "2up") {
    if (pick === "home") return "Home";
    if (pick === "draw") return "Draw";
    return "Away";
  }
  if (market === "dc") {
    if (pick === "1x") return "Home or Draw";
    if (pick === "12") return "Home or Away";
    return "Draw or Away";
  }
  const line = ouLine(market);
  if (line != null) return `${pick === "over" ? "Over" : "Under"} ${line}`;
  if (market === "btts") return pick === "yes" ? "GG (Yes)" : "NG (No)";
  return pick;
}

/** Column heading used on the board (1 X 2, 1X 12 X2, Over 1.5…). */
export function pickColumn(market: string, pick: string): string {
  if (market === "1x2" || market === "1up" || market === "2up") {
    return pick === "home" ? "1" : pick === "draw" ? "X" : "2";
  }
  if (market === "dc") return pick.toUpperCase();
  const line = ouLine(market);
  if (line != null) return `${pick === "over" ? "Over" : "Under"} ${line}`;
  return pick === "yes" ? "GG" : "NG";
}

export type Score = { homeGoals: number; awayGoals: number };
export type GoalEvent = { minute: number; side: "home" | "away" };

/** Did this side ever lead by n goals at any moment of the match? */
function everLedBy(
  goals: GoalEvent[],
  side: "home" | "away",
  n: number
): boolean {
  let d = 0;
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  for (const g of sorted) {
    d += g.side === "home" ? 1 : -1;
    if (side === "home" && d >= n) return true;
    if (side === "away" && -d >= n) return true;
  }
  return false;
}

/**
 * Judge one pick. goals (the minute-by-minute timeline) is only needed for
 * the 1UP / 2UP markets, which pay early once a team leads by 1 / 2 goals.
 */
export function legWins(
  score: Score,
  goals: GoalEvent[] | undefined,
  market: string,
  pick: string
): boolean {
  const { homeGoals: hg, awayGoals: ag } = score;
  const total = hg + ag;
  switch (market) {
    case "1x2":
      if (pick === "home") return hg > ag;
      if (pick === "away") return ag > hg;
      return hg === ag;
    case "1up":
    case "2up": {
      const n = market === "1up" ? 1 : 2;
      if (pick === "draw") return hg === ag;
      const side = pick === "home" ? "home" : "away";
      const finalWin = side === "home" ? hg > ag : ag > hg;
      if (finalWin) return true;
      return goals ? everLedBy(goals, side, n) : false;
    }
    case "dc":
      if (pick === "1x") return hg >= ag;
      if (pick === "12") return hg !== ag;
      return ag >= hg;
    case "ou15":
    case "ou25":
    case "ou35": {
      const line = ouLine(market) ?? 2.5;
      return pick === "over" ? total > line : total < line;
    }
    case "btts": {
      const both = hg > 0 && ag > 0;
      return pick === "yes" ? both : !both;
    }
    default:
      return false;
  }
}

/** Score at a given minute (goals with minute <= m). */
export function scoreAt(
  goals: GoalEvent[] | undefined,
  minute: number
): { h: number; a: number } {
  let h = 0;
  let a = 0;
  for (const g of goals ?? []) {
    if (g.minute <= minute) {
      if (g.side === "home") h++;
      else a++;
    }
  }
  return { h, a };
}
