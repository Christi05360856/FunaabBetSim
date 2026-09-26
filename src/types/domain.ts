/**
 * Core domain types for FUNAAB BetSim.
 * Milestones 1–6 plus the match lifecycle engine (live clock, halftime,
 * second half, source tracking for future fixture-import adapters).
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
  createdAt: number;
  updatedAt: number;
}

export interface Competition {
  id: string;
  name: string;
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
  round: number | null; // e.g. "Round 7" — optional, for imported/leagued fixtures
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: number;
  status: MatchStatus;
  /** Final score — set only by settlement. Never updated by live-score. */
  homeScore: number | null;
  awayScore: number | null;
  /**
   * Interim / in-play score. Updated repeatedly while the match is
   * live / halftime / second_half. Independent of settlement.
   * Existing documents may lack these fields — treat missing as null.
   */
  currentHomeScore: number | null;
  currentAwayScore: number | null;
  venue: string | null;
  source: "manual" | "bulk_import"; // where this fixture came from — extensible for future providers
  sourceEventId: string | null; // an external id, if ever imported from a real provider
  createdAt: number;
  updatedAt: number;
}

// Simulated match-clock timing (spec: "this is a simulation rule", not real football).
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

// ---- Bets & transactions --------------------------------------------------------

export type BetStatus = "open" | "won" | "lost" | "void";

export interface Bet {
  id: string;
  uid: string;
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
}

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

// Add Over/Under line type:
export interface OverUnderMarket extends Market {
  type: "over_under";
  line: number; // e.g., 2.5 goals
}

// Selection IDs for different market types:
// match_winner: "home" | "draw" | "away"
// double_chance: "home_draw" | "home_away" | "draw_away"
// draw_no_bet: "home" | "away"
// over_under: "over" | "under"
