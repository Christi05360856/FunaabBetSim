export type BetLegStatus = "pending" | "won" | "lost" | "void";

/** One leg of a single or accumulator ticket. */
export interface BetLeg {
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string;
  odds: number;
  /** Set during settlement; pending until that fixture is settled. */
  status?: BetLegStatus;
}

export interface Bet {
  id: string;
  uid: string;
  userId?: string;
  type?: "single" | "accumulator";
  legs?: BetLeg[];
  /**
   * All match ids on this ticket — used by settle with array-contains
   * so leg 2+ of an accumulator are found when those fixtures settle.
   */
  matchIds?: string[];
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string;
  oddsAtPlacement: number;
  stake: number;
  potentialPayout: number;
  status: BetStatus;
  placedAt: number;
  settledAt: number | null;
  payout?: number;
  hidden?: boolean;
}
