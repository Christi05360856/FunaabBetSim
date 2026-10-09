/**
 * Shared Instant Virtual Football — demo chips, clock-scheduled rounds.
 */

export const VIRTUAL_MATCHES_PER_LEAGUE = 6;
export const VIRTUAL_HOUSE_MARGIN = 0.06;
export const VIRTUAL_MIN_ODDS = 1.15;
export const VIRTUAL_MAX_ODDS = 50;

export type VirtualMarketId = "1x2" | "ou25" | "btts";
export type Virtual1x2Pick = "home" | "draw" | "away";
export type VirtualOuPick = "over" | "under";
export type VirtualBttsPick = "yes" | "no";

export type VirtualSelection =
  | { market: "1x2"; pick: Virtual1x2Pick }
  | { market: "ou25"; pick: VirtualOuPick }
  | { market: "btts"; pick: VirtualBttsPick };

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

export interface VirtualMatchPublic {
  id: string;
  league: string;
  home: string;
  away: string;
  odds1x2: VirtualOdds1x2;
  oddsOu25: VirtualOddsOu;
  oddsBtts: VirtualOddsBtts;
}

/** Score + goal timeline (only after kickoff). */
export interface VirtualMatchResult {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  /** Minute markers 1–90 when goals were scored (home/away). */
  goals: Array<{ minute: number; side: "home" | "away" }>;
}

export interface VirtualRoundPublic {
  id: string;
  index: number;
  startsAt: number;
  kickoffAt: number;
  endsAt: number;
  phase: "betting" | "live" | "result";
  dayKey: string;
  /** sha256 of day seed — published always. */
  dayCommitment: string;
  matches: VirtualMatchPublic[];
  /** Present only after kickoff. */
  results?: VirtualMatchResult[];
  serverNow: number;
  msToKickoff: number;
  msToEnd: number;
}

export interface VirtualBetLeg {
  matchId: string;
  market: VirtualMarketId;
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
