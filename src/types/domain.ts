/**
 * Core domain types for FUNAAB BetSim.
 * Milestones 1–3 (auth/wallet, sports domain, markets/odds) plus Milestone 4
 * (bets + transactions) all live together here.
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
  balance: number; // Naira; must stay >= 0 (spec §14 invariant)
  lifetimeWagering: number;
  resetPendingSince: number | null;
  updatedAt: number;
}

export const STARTING_BALANCE = 100_000;
export const MINIMUM_STAKE = 1_000;
export const RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ---- Sports domain (Milestone 2) ------------------------------------------

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
  | "finished"
  | "result_confirmed"
  | "settled"
  | "postponed"
  | "voided";

export interface Match {
  id: string;
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: number;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---- Markets & odds (Milestone 3) ------------------------------------------

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

// ---- Bets & transactions (Milestone 4) -------------------------------------

export type BetStatus = "open" | "won" | "lost" | "void";

export interface Bet {
  id: string;
  uid: string;
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string; // copied at placement — display never needs a join
  oddsAtPlacement: number; // spec §9: settlement must use this, never live odds
  stake: number;
  potentialPayout: number; // stake * oddsAtPlacement, precomputed
  status: BetStatus;
  placedAt: number;
  settledAt: number | null;
}

export type TransactionType = "debit_bet" | "payout" | "refund" | "reset";

export interface Transaction {
  id: string;
  uid: string;
  type: TransactionType;
  amount: number; // negative for debit_bet, positive for payout/refund/reset
  balanceAfter: number;
  betId: string | null; // null for a reset transaction
  createdAt: number;
}
