import "server-only";
import { randomBytes } from "crypto";
import {
  TEAMS_BY_LEAGUE,
  VIRTUAL_LEAGUES,
  type VirtualLeagueId,
} from "./teamPool";
import { makePrng } from "@/lib/fair/commit";
import {
  VIRTUAL_HOUSE_MARGIN,
  VIRTUAL_MATCHES_PER_LEAGUE,
  VIRTUAL_MAX_ODDS,
  VIRTUAL_MIN_ODDS,
  type VirtualMatchPublic,
  type VirtualMarketOdds,
  type VirtualMatchResult,
  type VirtualOdds1x2,
  type VirtualOddsBtts,
  type VirtualOddsOu,
  type VirtualSelection,
} from "@/types/virtual";
import { legWins, type MarketId } from "./markets";

/**
 * Apply book overround, clamp odds floors/ceilings, then re-scale so
 * sum(1/odds) ≈ 1+margin (fixes audit odds-floor weakness).
 */
function applyMargin(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  const norm = probs.map((p) => Math.max(p, 1e-9) / sum);
  const edge = 1 + VIRTUAL_HOUSE_MARGIN;
  let odds = norm.map((p) => 1 / (p * edge));
  odds = odds.map((o) => Math.min(VIRTUAL_MAX_ODDS, Math.max(VIRTUAL_MIN_ODDS, o)));
  const invSum = odds.reduce((a, o) => a + 1 / o, 0);
  const scale = invSum / edge;
  return odds.map((o) => Math.round(o * scale * 100) / 100);
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function odds1x2(hs: number, as: number): VirtualOdds1x2 {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  let pH = 0,
    pD = 0,
    pA = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p =
        (Math.exp(-eh) * Math.pow(eh, i)) / factorial(i) *
        ((Math.exp(-ea) * Math.pow(ea, j)) / factorial(j));
      if (i > j) pH += p;
      else if (i === j) pD += p;
      else pA += p;
    }
  }
  const [oh, od, oa] = applyMargin([pH, pD, pA]);
  return { home: oh ?? 2.5, draw: od ?? 3.2, away: oa ?? 2.8 };
}

function oddsOu25(hs: number, as: number): VirtualOddsOu {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  let pUnder = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      if (i + j < 3) {
        pUnder +=
          (Math.exp(-eh) * Math.pow(eh, i)) / factorial(i) *
          ((Math.exp(-ea) * Math.pow(ea, j)) / factorial(j));
      }
    }
  }
  pUnder = Math.min(0.85, Math.max(0.15, pUnder));
  const [ou, uu] = applyMargin([1 - pUnder, pUnder]);
  return { over: ou ?? 1.9, under: uu ?? 1.9 };
}

function oddsBtts(hs: number, as: number): VirtualOddsBtts {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  let p00 = 0,
    pBoth = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p =
        (Math.exp(-eh) * Math.pow(eh, i)) / factorial(i) *
        ((Math.exp(-ea) * Math.pow(ea, j)) / factorial(j));
      if (i === 0 && j === 0) p00 += p;
      if (i > 0 && j > 0) pBoth += p;
    }
  }
  const pYes = Math.min(0.85, Math.max(0.15, pBoth));
  const pNo = Math.min(0.85, Math.max(0.15, 1 - pYes));
  const [yy, nn] = applyMargin([pYes, pNo]);
  return { yes: yy ?? 1.85, no: nn ?? 1.95 };
}

/** Expected goals used by every odds function (same as the 1X2 model). */
function lambdas(hs: number, as: number) {
  return { eh: 1.25 * hs * (1 / as), ea: 1.1 * as * (1 / hs) };
}

function pois(lam: number, k: number): number {
  return (Math.exp(-lam) * Math.pow(lam, k)) / factorial(k);
}

/**
 * Price one outcome on its own: 1/(p x margin).
 * If that price would be shorter than the minimum we dare offer, the pick is
 * suspended (0) instead of being floored — flooring a near-certain pick at
 * 1.15 would hand the player a positive edge.
 */
function priceOf(p: number): number {
  if (p <= 0) return 0;
  const o = 1 / (p * (1 + VIRTUAL_HOUSE_MARGIN));
  if (o < VIRTUAL_MIN_ODDS) return 0;
  return Math.round(Math.min(VIRTUAL_MAX_ODDS, o) * 100) / 100;
}

/**
 * Chance a side wins the 1UP / 2UP pick: it finishes ahead, OR it leads by
 * n goals at any moment (the bet is paid early). Goals are spread evenly over
 * 90 minutes; the lead is stepped minute by minute with an "already n up"
 * flag.
 */
function pWinOrEverLeadBy(
  n: number,
  scoreLam: number,
  concedeLam: number
): number {
  const ps = Math.min(0.5, scoreLam / 90);
  const pc = Math.min(0.5, concedeLam / 90);
  const OFFSET = 10;
  const SIZE = 2 * OFFSET + 1;
  // dist[flag][diff + OFFSET]
  let dist: number[][] = [new Array(SIZE).fill(0), new Array(SIZE).fill(0)];
  dist[0]![OFFSET] = 1;
  const stay = (1 - ps) * (1 - pc) + ps * pc;
  const up = ps * (1 - pc);
  const down = (1 - ps) * pc;
  for (let t = 0; t < 90; t++) {
    const next: number[][] = [new Array(SIZE).fill(0), new Array(SIZE).fill(0)];
    for (let flag = 0; flag < 2; flag++) {
      for (let i = 0; i < SIZE; i++) {
        const m = dist[flag]![i]!;
        if (!m) continue;
        next[flag]![i]! += m * stay;
        if (i + 1 < SIZE) {
          const f = flag === 1 || i + 1 - OFFSET >= n ? 1 : 0;
          next[f]![i + 1]! += m * up;
        }
        if (i - 1 >= 0) next[flag]![i - 1]! += m * down;
      }
    }
    dist = next;
  }
  let p = 0;
  for (let i = 0; i < SIZE; i++) {
    p += dist[1]![i]!;
    if (i - OFFSET > 0) p += dist[0]![i]!;
  }
  return Math.min(1, p);
}

function buildMarkets(hs: number, as: number): VirtualMarketOdds {
  const { eh, ea } = lambdas(hs, as);
  let pH = 0, pD = 0, pA = 0, pBoth = 0;
  const pTotalLe = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p = pois(eh, i) * pois(ea, j);
      if (i > j) pH += p;
      else if (i === j) pD += p;
      else pA += p;
      if (i > 0 && j > 0) pBoth += p;
      pTotalLe[i + j]! += p;
    }
  }
  const norm = pH + pD + pA || 1;
  pH /= norm;
  pD /= norm;
  pA /= norm;
  const underP = (line: number) => {
    let u = 0;
    for (let t = 0; t < line; t++) u += pTotalLe[t]!;
    return Math.min(0.97, Math.max(0.03, u / norm));
  };
  const bothP = Math.min(0.97, Math.max(0.03, pBoth / norm));

  const home1 = pWinOrEverLeadBy(1, eh, ea);
  const away1 = pWinOrEverLeadBy(1, ea, eh);
  const home2 = pWinOrEverLeadBy(2, eh, ea);
  const away2 = pWinOrEverLeadBy(2, ea, eh);

  const ou = (line: number) => ({
    over: priceOf(1 - underP(line)),
    under: priceOf(underP(line)),
  });

  return {
    "1x2": { home: priceOf(pH), draw: priceOf(pD), away: priceOf(pA) },
    "1up": { home: priceOf(Math.max(pH, home1)), draw: priceOf(pD), away: priceOf(Math.max(pA, away1)) },
    "2up": { home: priceOf(Math.max(pH, home2)), draw: priceOf(pD), away: priceOf(Math.max(pA, away2)) },
    dc: { "1x": priceOf(pH + pD), "12": priceOf(pH + pA), x2: priceOf(pD + pA) },
    ou15: ou(2),
    ou25: ou(3),
    ou35: ou(4),
    btts: { yes: priceOf(bothP), no: priceOf(1 - bothP) },
  };
}

function starsOf(strength: number): number {
  return Math.min(5, Math.max(1, Math.round(1 + ((strength - 0.55) / 1.0) * 4)));
}

function poisson(rand: () => number, lambda: number): number {
  // Clamp lambda so virtual scores stay football-like (0–5 typical)
  const lam = Math.min(3.2, Math.max(0.15, lambda));
  const L = Math.exp(-lam);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L && k < 8);
  return Math.min(6, k - 1);
}

function strength(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(1.55, Math.max(0.55, 1 + z * 0.18));
}

function pairsFromLeague(
  rand: () => number,
  league: VirtualLeagueId,
  count: number
) {
  const pool = [...TEAMS_BY_LEAGUE[league]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const pairs: Array<{ home: string; away: string }> = [];
  for (let i = 0; i + 1 < pool.length && pairs.length < count; i += 2) {
    pairs.push({ home: pool[i]!, away: pool[i + 1]! });
  }
  return pairs;
}

export type VirtualMatchInternal = VirtualMatchPublic & {
  homeStrength: number;
  awayStrength: number;
};

/** Deterministic board from round seed — same for every player. */
export function generateRoundFromSeed(seedHex: string): VirtualMatchInternal[] {
  const rand = makePrng(seedHex);
  const out: VirtualMatchInternal[] = [];
  let n = 0;
  for (const lg of VIRTUAL_LEAGUES) {
    const pairs = pairsFromLeague(rand, lg.id, VIRTUAL_MATCHES_PER_LEAGUE);
    for (const p of pairs) {
      n += 1;
      const hs = strength(rand);
      const as = strength(rand);
      out.push({
        id: `vm${n}`,
        league: lg.id,
        home: p.home,
        away: p.away,
        homeStrength: hs,
        awayStrength: as,
        odds1x2: odds1x2(hs, as),
        oddsOu25: oddsOu25(hs, as),
        oddsBtts: oddsBtts(hs, as),
        markets: buildMarkets(hs, as),
        homeStars: starsOf(hs),
        awayStars: starsOf(as),
      });
    }
  }
  return out;
}

export function resolveScoreFromRand(
  rand: () => number,
  hs: number,
  as: number
): { homeGoals: number; awayGoals: number } {
  // Strength ~0.55–1.55 → expected goals ~0.8–2.5 (real football range)
  const ratio = Math.min(1.8, Math.max(0.55, hs / as));
  const eh = 1.15 * ratio;
  const ea = 1.0 / ratio;
  return {
    homeGoals: poisson(rand, eh),
    awayGoals: poisson(rand, ea),
  };
}

/** Full results + goal timeline for a seeded round. */
export function resolveRoundResults(
  seedHex: string,
  matches: VirtualMatchInternal[]
): VirtualMatchResult[] {
  const rand = makePrng(seedHex + ":scores");
  return matches.map((m) => {
    const { homeGoals, awayGoals } = resolveScoreFromRand(
      rand,
      m.homeStrength,
      m.awayStrength
    );
    const goals: VirtualMatchResult["goals"] = [];
    for (let g = 0; g < homeGoals; g++) {
      goals.push({ minute: 1 + Math.floor(rand() * 90), side: "home" });
    }
    for (let g = 0; g < awayGoals; g++) {
      goals.push({ minute: 1 + Math.floor(rand() * 90), side: "away" });
    }
    goals.sort((a, b) => a.minute - b.minute);
    return {
      matchId: m.id,
      homeGoals,
      awayGoals,
      goals,
    };
  });
}

export function selectionWins(
  score: { homeGoals: number; awayGoals: number },
  sel: VirtualSelection,
  goals?: Array<{ minute: number; side: "home" | "away" }>
): boolean {
  return legWins(score, goals, sel.market, sel.pick);
}

export function publicMatch(m: VirtualMatchInternal): VirtualMatchPublic {
  return {
    id: m.id,
    league: m.league,
    home: m.home,
    away: m.away,
    odds1x2: m.odds1x2,
    oddsOu25: m.oddsOu25,
    oddsBtts: m.oddsBtts,
    markets: m.markets,
    homeStars: m.homeStars,
    awayStars: m.awayStars,
  };
}

export function lookupOdds(
  m: VirtualMatchPublic,
  market: string,
  pick: string
): number | null {
  const fromBook = m.markets?.[market as MarketId]?.[pick];
  if (typeof fromBook === "number") return fromBook > 0 ? fromBook : null;
  if (market === "1x2") {
    if (pick === "home") return m.odds1x2.home;
    if (pick === "draw") return m.odds1x2.draw;
    if (pick === "away") return m.odds1x2.away;
  }
  if (market === "ou25") {
    if (pick === "over") return m.oddsOu25.over;
    if (pick === "under") return m.oddsOu25.under;
  }
  if (market === "btts") {
    if (pick === "yes") return m.oddsBtts.yes;
    if (pick === "no") return m.oddsBtts.no;
  }
  return null;
}

/** Legacy unseeded board for old rounds.ts / play route. Prefer generateRoundFromSeed. */
export function generateRoundMatches(): VirtualMatchInternal[] {
  const seed = randomBytes(32).toString("hex");
  return generateRoundFromSeed(seed);
}

/** Legacy instant settle for old play/route.ts — random score from strengths. */
export function resolveScore(
  hs: number,
  as: number
): { homeGoals: number; awayGoals: number } {
  const seed = randomBytes(16).toString("hex");
  return resolveScoreFromRand(makePrng(seed), hs, as);
}

          
