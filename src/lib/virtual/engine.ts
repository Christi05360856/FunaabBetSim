import "server-only";
import { randomBytes } from "crypto";
import { VIRTUAL_TEAM_POOL } from "./teamPool";
import {
  VIRTUAL_HOUSE_MARGIN,
  VIRTUAL_MATCHES_PER_ROUND,
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

function pickTeams(n: number): Array<{ home: string; away: string }> {
  const pool = [...VIRTUAL_TEAM_POOL];
  // Fisher-Yates partial
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(unit() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const pairs: Array<{ home: string; away: string }> = [];
  for (let i = 0; i + 1 < pool.length && pairs.length < n; i += 2) {
    pairs.push({ home: pool[i]!, away: pool[i + 1]! });
  }
  return pairs;
}

/** Strength ~ N(1, 0.18) clipped */
function strength(): number {
  // Box-Muller-ish via two uniforms
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

function applyMargin(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  const norm = probs.map((p) => p / sum);
  const edge = 1 + VIRTUAL_HOUSE_MARGIN;
  const inv = norm.map((p) => 1 / Math.max(p, 0.02));
  const invSum = inv.reduce((a, b) => a + b, 0);
  // Scale so implied probs sum to edge
  const target = edge;
  const scale = invSum / target;
  return inv.map((x) => Math.round((x / scale) * 100) / 100);
}

function odds1x2FromStrength(hs: number, as: number): VirtualOdds1x2 {
  // Expected goals
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  // Approximate 1x2 via discrete poisson 0..6
  let pH = 0;
  let pD = 0;
  let pA = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p =
        Math.exp(-eh) * Math.pow(eh, i) / factorial(i) *
        Math.exp(-ea) * Math.pow(ea, j) / factorial(j);
      if (i > j) pH += p;
      else if (i === j) pD += p;
      else pA += p;
    }
  }
  const [oh, od, oa] = applyMargin([pH, pD, pA]);
  return {
    home: Math.max(1.2, oh ?? 2.5),
    draw: Math.max(1.2, od ?? 3.2),
    away: Math.max(1.2, oa ?? 2.8),
  };
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function oddsOu25(hs: number, as: number): VirtualOddsOu {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  let pUnder = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      if (i + j < 3) {
        pUnder +=
          Math.exp(-eh) * Math.pow(eh, i) / factorial(i) *
          Math.exp(-ea) * Math.pow(ea, j) / factorial(j);
      }
    }
  }
  pUnder = Math.min(0.85, Math.max(0.15, pUnder));
  const pOver = 1 - pUnder;
  const [ou, uu] = applyMargin([pOver, pUnder]);
  return {
    over: Math.max(1.25, ou ?? 1.9),
    under: Math.max(1.25, uu ?? 1.9),
  };
}

function oddsBtts(hs: number, as: number): VirtualOddsBtts {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  // P(home=0) * anything + ...
  let pYes = 0;
  for (let i = 1; i <= 6; i++) {
    for (let j = 1; j <= 6; j++) {
      pYes +=
        Math.exp(-eh) * Math.pow(eh, i) / factorial(i) *
        Math.exp(-ea) * Math.pow(ea, j) / factorial(j);
    }
  }
  pYes = Math.min(0.85, Math.max(0.15, pYes));
  const pNo = 1 - pYes;
  const [yy, nn] = applyMargin([pYes, pNo]);
  return {
    yes: Math.max(1.25, yy ?? 1.85),
    no: Math.max(1.25, nn ?? 1.95),
  };
}

export type VirtualMatchInternal = VirtualMatchPublic & {
  homeStrength: number;
  awayStrength: number;
};

export function generateRoundMatches(
  count = VIRTUAL_MATCHES_PER_ROUND
): VirtualMatchInternal[] {
  const pairs = pickTeams(count);
  return pairs.map((p, idx) => {
    const hs = strength();
    const as = strength();
    return {
      id: "vm" + (idx + 1),
      home: p.home,
      away: p.away,
      homeStrength: hs,
      awayStrength: as,
      odds1x2: odds1x2FromStrength(hs, as),
      oddsOu25: oddsOu25(hs, as),
      oddsBtts: oddsBtts(hs, as),
    };
  });
}

export function resolveScore(hs: number, as: number): {
  homeGoals: number;
  awayGoals: number;
} {
  const eh = 1.25 * hs * (1 / as);
  const ea = 1.1 * as * (1 / hs);
  return {
    homeGoals: poisson(eh),
    awayGoals: poisson(ea),
  };
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
    if (sel.pick === "over") return total >= 3;
    return total <= 2;
  }
  // btts
  const both = hg > 0 && ag > 0;
  return sel.pick === "yes" ? both : !both;
}

export function publicMatch(m: VirtualMatchInternal): VirtualMatchPublic {
  return {
    id: m.id,
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
