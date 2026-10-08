/** Instant Virtual Football — demo chips only (casino wallet). */

export const VIRTUAL_MATCHES_PER_ROUND = 8;
export const VIRTUAL_ROUND_TTL_MS = 10 * 60 * 1000;
export const VIRTUAL_HOUSE_MARGIN = 0.06;

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
  home: string;
  away: string;
  odds1x2: VirtualOdds1x2;
  oddsOu25: VirtualOddsOu;
  oddsBtts: VirtualOddsBtts;
}

export interface VirtualRoundPublic {
  id: string;
  createdAt: number;
  expiresAt: number;
  matches: VirtualMatchPublic[];
}

export interface VirtualPlayLeg {
  matchId: string;
  market: VirtualMarketId;
  pick: string;
  odds: number;
}
