/**
 * Core domain types for FUNAAB BetSim.
 * Production MVP + accumulator / booking-code extensions.
 */

export type UserRole = "user" | "admin";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: number;
}

export interface Wallet {
  uid: string;
  balance: number;
  lifetimeWagering: number;
  resetPendingSince: number | null;
  updatedAt: number;
}

export const STARTING_BALANCE = 100_000;
export const MINIMUM_STAKE = 1_000;
export const RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ---- Sports domain ----------------------------------------------------------

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Competition {
  id: string;
  name: string;
  /** football-data.org code e.g. PL, PD — set only for externally-synced competitions. */
  providerCode?: string | null;
  provider?: "football-data" | null;
  createdAt: number;
  updatedAt: number;
}

export type MatchStatus =
  | "draft"
  | "scheduled"
  | "open"
  | "locked"
  | "live"
  | "halftime"
  | "second_half"
  | "finished"
  | "result_confirmed"
  | "settled"
  | "postponed"
  | "voided";

export interface Match {
  id: string;
  competitionId: string;
  round: number | null;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: number;
  status: MatchStatus;
  /** Final score — set only by settlement. */
  homeScore: number | null;
  awayScore: number | null;
  /** Interim / in-play score while live. */
  currentHomeScore: number | null;
  currentAwayScore: number | null;
  venue: string | null;
  source: "manual" | "bulk_import" | "external";
  sourceEventId: string | null; // football-data match id as string
  provider?: "football-data" | null;
  createdAt: number;
  updatedAt: number;
}

export const FIRST_HALF_MINUTES = 45;
export const HALFTIME_MINUTES = 15;
export const SECOND_HALF_MINUTES = 45;
export const FIRST_HALF_ADDED_TIME = 2;
export const SECOND_HALF_ADDED_TIME = 2;

// ---- Markets & odds ----------------------------------------------------

export type MarketStatus = "draft" | "active" | "locked" | "settled" | "disabled";

export type MarketType =
  | "match_winner"
  | "double_chance"
  | "draw_no_bet"
  | "over_under"
  | "both_teams_to_score"
  | "correct_score";

export interface Selection {
  id: string;
  label: string;
  odds: number;
}

export interface Market {
  id: string;
  matchId: string;
  type: MarketType;
  status: MarketStatus;
  selections: Selection[];
  createdAt: number;
  updatedAt: number;
}

// ---- Bets (singles + accumulators) --------------------------------------

export type BetStatus = "open" | "won" | "lost" | "void";

/** One leg of a single or accumulator ticket. */
export interface BetLeg {
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string;
  odds: number;
}

export interface Bet {
  id: string;
  /** Uppercase public code for verify/share. */
  ticketCode?: string;
  uid: string;
  /** Optional mirror of uid used by some newer routes. */
  userId?: string;
  /** single = one selection; accumulator = multiple legs. */
  type?: "single" | "accumulator";
  /** Legs for accumulator (and preferred for new singles). */
  legs?: BetLeg[];
  // ---- Legacy single-bet fields (existing bets in Firestore still have these) ----
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
  /** Optional explicit payout amount after settlement. */
  payout?: number;
  /** Bettor hid this ticket from their own history. Does not affect settlement. */
  hidden?: boolean;
}

export interface BookingCode {
  id: string;
  legs: BetLeg[];
  totalOdds: number;
  createdAt: number;
}

// ---- Wallet ledger ------------------------------------------------------

export type TransactionType = "debit_bet" | "payout" | "refund" | "reset";

export interface Transaction {
  id: string;
  uid: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  betId: string | null;
  createdAt: number;
}

/**
 * Selection ID conventions:
 * match_winner: "home" | "draw" | "away"
 * double_chance: "home_draw" | "home_away" | "draw_away"
 * draw_no_bet: "home" | "away"
 * over_under: "over_<line>" | "under_<line>"
 * both_teams_to_score: "yes" | "no"
 * correct_score: "<home>-<away>" | "other_home" | "other_away" | "other_draw"
 */
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
