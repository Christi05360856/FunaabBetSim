/**
 * Derives every other market's odds from a single Match Winner (1X2) price.
 * Pure math, no database — importable from client or server.
 *
 * Two different kinds of derivation happen here, and it's worth being
 * explicit about which is which:
 *
 * 1. Double Chance and Draw No Bet are EXACT recombinations of the same
 *    three win/draw/loss probabilities implied by the 1X2 price. No model,
 *    no assumption, no error — just algebra.
 *
 * 2. Over/Under, Both Teams to Score, and Correct Score depend on the full
 *    distribution of possible scorelines, which 1X2 odds alone don't
 *    determine (e.g. 1-0 and 4-3 can imply the same match-winner odds but
 *    very different goals markets). To get there we FIT a standard
 *    independent-Poisson goals model (home goals ~ Poisson(λh), away goals
 *    ~ Poisson(λa)) to the three 1X2 probabilities, then read every other
 *    market off that fitted model. This is the standard textbook approach
 *    bookmakers use as a starting point — it's an approximation, not an
 *    exact derivation, and is only as good as the independent-Poisson
 *    assumption (real football has a small positive correlation toward
 *    low-scoring draws that this ignores — acceptable for a simulator).
 */

const ODDS_MIN = 1.01;
const ODDS_MAX = 1000;
const PROB_FLOOR = 1 / ODDS_MAX;

function clampOdds(odds: number): number {
  if (!Number.isFinite(odds)) return ODDS_MAX;
  return Math.round(Math.min(ODDS_MAX, Math.max(ODDS_MIN, odds)) * 100) / 100;
}

function probToOdds(p: number): number {
  return clampOdds(1 / Math.max(p, PROB_FLOOR));
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Implied win/draw/loss probabilities from 1X2 odds, with the bookmaker's overround removed (normalized to sum to 1). */
export function impliedProbabilities(homeOdds: number, drawOdds: number, awayOdds: number) {
  const rawHome = 1 / homeOdds;
  const rawDraw = 1 / drawOdds;
  const rawAway = 1 / awayOdds;
  const sum = rawHome + rawDraw + rawAway;
  return { pHome: rawHome / sum, pDraw: rawDraw / sum, pAway: rawAway / sum };
}

/** Double Chance and Draw No Bet — exact algebra on the 1X2 probabilities, no goals model involved. */
export function deriveExactMarkets(pHome: number, pDraw: number, pAway: number) {
  return {
    doubleChance: {
      home_draw: probToOdds(pHome + pDraw), // "1X"
      home_away: probToOdds(pHome + pAway), // "12"
      draw_away: probToOdds(pDraw + pAway), // "X2"
    },
    drawNoBet: {
      home: probToOdds(pHome / (pHome + pAway)),
      away: probToOdds(pAway / (pHome + pAway)),
    },
  };
}

const GRID_MAX_GOALS = 12;

function scoreGrid(lambdaHome: number, lambdaAway: number): number[][] {
  const grid: number[][] = [];
  for (let h = 0; h <= GRID_MAX_GOALS; h++) {
    grid[h] = [];
    const ph = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= GRID_MAX_GOALS; a++) {
      grid[h]![a] = ph * poissonPmf(a, lambdaAway);
    }
  }
  return grid;
}

function outcomeProbsFromGrid(grid: number[][]) {
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let h = 0; h <= GRID_MAX_GOALS; h++) {
    for (let a = 0; a <= GRID_MAX_GOALS; a++) {
      const p = grid[h]![a]!;
      if (h > a) pHome += p;
      else if (h < a) pAway += p;
      else pDraw += p;
    }
  }
  return { pHome, pDraw, pAway };
}

/**
 * Finds (λh, λa) — expected home/away goals — whose independent-Poisson
 * match-outcome probabilities best match the target 1X2 probabilities.
 * Coarse grid search (cheap: ~3–4k evaluations) followed by coordinate
 * descent refinement. Runs in well under a second even in a browser tab.
 */
export function solveExpectedGoals(pHomeTarget: number, pDrawTarget: number): { lambdaHome: number; lambdaAway: number } {
  function error(lh: number, la: number): number {
    const { pHome, pDraw } = outcomeProbsFromGrid(scoreGrid(lh, la));
    const dHome = pHome - pHomeTarget;
    const dDraw = pDraw - pDrawTarget;
    return dHome * dHome + dDraw * dDraw;
  }

  let best = { lh: 1.3, la: 1.1, err: Infinity };
  for (let lh = 0.2; lh <= 5.5; lh += 0.2) {
    for (let la = 0.2; la <= 5.5; la += 0.2) {
      const err = error(lh, la);
      if (err < best.err) best = { lh, la, err };
    }
  }

  let step = 0.1;
  for (let iter = 0; iter < 6; iter++) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dh, da] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
        const lh = best.lh + dh;
        const la = best.la + da;
        if (lh <= 0.05 || la <= 0.05) continue;
        const err = error(lh, la);
        if (err < best.err) {
          best = { lh, la, err };
          improved = true;
        }
      }
    }
    step /= 2;
  }

  return { lambdaHome: best.lh, lambdaAway: best.la };
}

export const OU_LINES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;

// The grid an admin can offer exact Correct Score odds for. Ids use "H-A"
// to match exactly what settle/route.ts's resolveCorrectScoreOutcome()
// produces from the final score.
export const CORRECT_SCORES = [
  "1-0", "2-0", "2-1", "3-0", "3-1", "3-2", "4-0", "4-1", "4-2", "4-3",
  "0-0", "1-1", "2-2", "3-3", "4-4",
  "0-1", "0-2", "1-2", "0-3", "1-3", "2-3", "0-4", "1-4", "2-4", "3-4",
] as const;

export interface DerivedMarkets {
  matchWinner: { home: number; draw: number; away: number };
  doubleChance: { home_draw: number; home_away: number; draw_away: number };
  drawNoBet: { home: number; away: number };
  overUnder: { line: number; over: number; under: number }[];
  bothTeamsToScore: { yes: number; no: number };
  correctScore: { scores: Record<string, number>; otherHome: number; otherAway: number; otherDraw: number };
  /** For transparency in the UI — the fitted goals model behind O/U, BTTS and Correct Score. */
  model: { lambdaHome: number; lambdaAway: number };
}

/** The one function the UI calls: give it the admin's 1X2 odds, get every other market's odds back. */
export function deriveMarketsFromMatchWinner(homeOdds: number, drawOdds: number, awayOdds: number): DerivedMarkets {
  const { pHome, pDraw, pAway } = impliedProbabilities(homeOdds, drawOdds, awayOdds);
  const exact = deriveExactMarkets(pHome, pDraw, pAway);
  const { lambdaHome, lambdaAway } = solveExpectedGoals(pHome, pDraw);
  const grid = scoreGrid(lambdaHome, lambdaAway);

  const overUnder = OU_LINES.map((line) => {
    let pOver = 0;
    for (let h = 0; h <= GRID_MAX_GOALS; h++) {
      for (let a = 0; a <= GRID_MAX_GOALS; a++) {
        if (h + a > line) pOver += grid[h]![a]!;
      }
    }
    return { line, over: probToOdds(pOver), under: probToOdds(1 - pOver) };
  });

  let pAwayZero = 0, pHomeZero = 0;
  for (let a = 0; a <= GRID_MAX_GOALS; a++) pHomeZero += grid[0]![a]!;
  for (let h = 0; h <= GRID_MAX_GOALS; h++) pAwayZero += grid[h]![0]!;
  const pBothZero = grid[0]![0]!;
  const pBttsNo = pHomeZero + pAwayZero - pBothZero;
  const bothTeamsToScore = { yes: probToOdds(1 - pBttsNo), no: probToOdds(pBttsNo) };

  const scores: Record<string, number> = {};
  let coveredHomeWin = 0, coveredAwayWin = 0, coveredDraw = 0;
  for (const id of CORRECT_SCORES) {
    const [h, a] = id.split("-").map(Number) as [number, number];
    const p = grid[h]?.[a] ?? 0;
    scores[id] = probToOdds(p);
    if (h > a) coveredHomeWin += p;
    else if (h < a) coveredAwayWin += p;
    else coveredDraw += p;
  }
  const otherHome = probToOdds(Math.max(pHome - coveredHomeWin, PROB_FLOOR));
  const otherAway = probToOdds(Math.max(pAway - coveredAwayWin, PROB_FLOOR));
  const otherDraw = probToOdds(Math.max(pDraw - coveredDraw, PROB_FLOOR));

  return {
    matchWinner: { home: clampOdds(homeOdds), draw: clampOdds(drawOdds), away: clampOdds(awayOdds) },
    doubleChance: exact.doubleChance,
    drawNoBet: exact.drawNoBet,
    overUnder,
    bothTeamsToScore,
    correctScore: { scores, otherHome, otherAway, otherDraw },
    model: { lambdaHome, lambdaAway },
  };
}
