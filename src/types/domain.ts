/**
 * Core domain types for FUNAAB BetSim.
 * Milestone 1 (auth + wallet), Milestone 2 (sports domain), and now
 * Milestone 3 (markets + odds) all live together here.
 */

export type UserRole = "user" | "admin";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: number; // epoch ms, set server-side
}

export interface Wallet {
  uid: string;
  balance: number; // Naira; must stay >= 0 (spec §14 invariant)
  lifetimeWagering: number;
  resetPendingSince: number | null; // epoch ms when balance first hit 0, else null
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

// Only "match_winner" is actually buildable this milestone. The rest are
// named now (per spec §17's initial market list) so the type doesn't need
// reshaping later — but nothing constructs them yet.
export type MarketType =
  | "match_winner"
  | "double_chance"
  | "draw_no_bet"
  | "over_under"
  | "both_teams_to_score"
  | "correct_score";

export interface Selection {
  id: string; // stable key, e.g. "home" | "draw" | "away"
  label: string; // what the user sees, e.g. "Home", "Draw", "Away"
  odds: number; // decimal odds, e.g. 1.39 — always > 1
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

// ---- Forward-declared for later phases -------------------------------------

export type BetStatus = "open" | "won" | "lost" | "void";
