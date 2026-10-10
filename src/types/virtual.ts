/**
 * Shared Instant Virtual Football — demo chips, clock-scheduled rounds.
 */
import type { MarketId } from "@/lib/virtual/markets";

export const VIRTUAL_MATCHES_PER_LEAGUE = 10;
export const VIRTUAL_HOUSE_MARGIN = 0.06;
export const VIRTUAL_MIN_ODDS = 1.15;
export const VIRTUAL_MAX_ODDS = 50;

/** Legacy per-user board TTL (kept so old rounds.ts / play route still typecheck). */
export const VIRTUAL_ROUND_TTL_MS = 10 * 60 * 1000;

export type { MarketId as VirtualMarketId } from "@/lib/virtual/markets";
export type Virtual1x2Pick = "home" | "draw" | "away";
export type VirtualOuPick = "over" | "under";
export type VirtualBttsPick = "yes" | "no";

export type VirtualSelection = { market: MarketId; pick: string };

export interface VirtualOdds1x2 {
  home: number;
  draw: number;
  away: number;
}

export interface VirtualOddsOu {
  over: number;
  under: number;
}

export interface VirtualOddsBtts {
  yes: number;
  no: number;
}

/** Odds per market per pick. 0 = suspended (price too short to offer safely). */
export type VirtualMarketOdds = Record<MarketId, Record<string, number>>;

export interface VirtualMatchPublic {
  id: string;
  league: string;
  home: string;
  away: string;
  odds1x2: VirtualOdds1x2;
  oddsOu25: VirtualOddsOu;
  oddsBtts: VirtualOddsBtts;
  /** Every market the board offers (1X2, 1UP, 2UP, DC, O/U lines, GG/NG). */
  markets?: VirtualMarketOdds;
  /** Form rating 1–5 shown as stars next to each team. */
  homeStars?: number;
  awayStars?: number;
}

/** Score + goal timeline (only after kickoff). */
export interface VirtualMatchResult {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  /** Minute markers 1–90 when goals were scored (home/away). */
  goals: Array<{ minute: number; side: "home" | "away" }>;
}

/**
 * Round payload.
 * Shared clock rounds use index/startsAt/kickoffAt/phase.
 * Legacy per-user boards use createdAt/expiresAt only.
 */
export interface VirtualRoundPublic {
  id: string;
  matches: VirtualMatchPublic[];
  /** Shared schedule */
  index?: number;
  startsAt?: number;
  kickoffAt?: number;
  endsAt?: number;
  phase?: "betting" | "live" | "result";
  dayKey?: string;
  dayCommitment?: string;
  results?: VirtualMatchResult[];
  serverNow?: number;
  msToKickoff?: number;
  msToEnd?: number;
  /** Legacy */
  createdAt?: number;
  expiresAt?: number;
}

export interface VirtualBetLeg {
  matchId: string;
  market: MarketId;
  pick: string;
  odds: number;
}

export interface VirtualStanding {
  team: string;
  league: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
}
