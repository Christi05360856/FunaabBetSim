import "server-only";
import { randomBytes } from "crypto";
import {
  TEAMS_BY_LEAGUE,
  VIRTUAL_LEAGUES,
  type VirtualLeagueId,
} from "./teamPool";
import {
  VIRTUAL_HOUSE_MARGIN,
  VIRTUAL_MATCHES_PER_LEAGUE,
  type VirtualMatchPublic,
  type VirtualOdds1x2,
  type VirtualOddsBtts,
  type VirtualOddsOu,
  type VirtualSelection,
} from "@/types/virtual";

function unit(): number {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 0x1_0000_0000;
}

function strength(): number {
  const u = Math.max(1e-9, unit());
  const v = Math.max(1e-9, unit());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(1.55, Math.max(0.55, 1 + z * 0.18));
}

function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= unit();
  } while (p > L && k < 15);
  return k - 1;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function applyMargin(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  const norm = probs.map((p) => Math.max(p, 1e-6) / sum);
  const edge = 1 + VIRTUAL_HOUSE_MARGIN;
  // Book overround: sum(1/odds) = edge  →  odds_i = 1 / (p_i * edge)
  return norm.map((p) => {
    const o = 1 / (p * edge);
    return Math.round(Math.max(1.15, Math.min(o, 50)) * 100) / 100;
  });
}

function odds1x2FromStrength(hs: number, as: number): VirtualOdds1x2 {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  let pH = 0;
  let pD = 0;
  let pA = 0;
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
  return {
    home: oh ?? 2.5,
    draw: od ?? 3.2,
    away: oa ?? 2.8,
  };
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
  return {
    over: ou ?? 1.9,
    under: uu ?? 1.9,
  };
}

function oddsBtts(hs: number, as: number): VirtualOddsBtts {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  let pYes = 0;
  for (let i = 1; i <= 6; i++) {
    for (let j = 1; j <= 6; j++) {
      pYes +=
        (Math.exp(-eh) * Math.pow(eh, i)) / factorial(i) *
        ((Math.exp(-ea) * Math.pow(ea, j)) / factorial(j));
    }
  }
  pYes = Math.min(0.85, Math.max(0.15, pYes));
  const [yy, nn] = applyMargin([pYes, 1 - pYes]);
  return {
    yes: yy ?? 1.85,
    no: nn ?? 1.95,
  };
}

function pairsFromLeague(league: VirtualLeagueId, count: number) {
  const pool = [...TEAMS_BY_LEAGUE[league]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(unit() * (i + 1));
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

export function generateRoundMatches(
  perLeague = VIRTUAL_MATCHES_PER_LEAGUE
): VirtualMatchInternal[] {
  const out: VirtualMatchInternal[] = [];
  let n = 0;
  for (const lg of VIRTUAL_LEAGUES) {
    const pairs = pairsFromLeague(lg.id, perLeague);
    for (const p of pairs) {
      n += 1;
      const hs = strength();
      const as = strength();
      out.push({
        id: "vm" + n,
        league: lg.id,
        home: p.home,
        away: p.away,
        homeStrength: hs,
        awayStrength: as,
        odds1x2: odds1x2FromStrength(hs, as),
        oddsOu25: oddsOu25(hs, as),
        oddsBtts: oddsBtts(hs, as),
      });
    }
  }
  return out;
}

export function resolveScore(
  hs: number,
  as: number
): { homeGoals: number; awayGoals: number } {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  return { homeGoals: poisson(eh), awayGoals: poisson(ea) };
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
