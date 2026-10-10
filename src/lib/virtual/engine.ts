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
  type VirtualMatchResult,
  type VirtualOdds1x2,
  type VirtualOddsBtts,
  type VirtualOddsOu,
  type VirtualSelection,
} from "@/types/virtual";

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
  sel: VirtualSelection
): boolean {
  const { homeGoals: hg, awayGoals: ag } = score;
  if (sel.market === "1x2") {
    if (sel.pick === "home") return hg > ag;
    if (sel.pick === "away") return ag > hg;
    return hg === ag;
  }
  if (sel.market === "ou25") {
    const total = hg + ag;
    return sel.pick === "over" ? total >= 3 : total <= 2;
  }
  const both = hg > 0 && ag > 0;
  return sel.pick === "yes" ? both : !both;
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
  };
}

export function lookupOdds(
  m: VirtualMatchPublic,
  market: string,
  pick: string
): number | null {
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

        
