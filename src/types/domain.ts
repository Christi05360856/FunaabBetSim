/**
 * Core domain types for FUNAAB BetSim.
 * Milestone 1 (auth + wallet) and Milestone 2 (sports domain) types live
 * together here. Market/Bet types are still forward-declared, unused until
 * Milestone 3.
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
  shortName: string; // e.g. "COE" for a display-friendly abbreviation
  createdAt: number;
  updatedAt: number;
}

export interface Competition {
  id: string;
  name: string; // e.g. "FUNAAB Inter-College League"
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
  kickoffAt: number; // epoch ms
  status: MatchStatus;
  homeScore: number | null; // filled in once FINISHED
  awayScore: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---- Forward-declared for later phases -------------------------------------

export type MarketStatus = "draft" | "active" | "locked" | "settled" | "disabled";

export type BetStatus = "open" | "won" | "lost" | "void";
