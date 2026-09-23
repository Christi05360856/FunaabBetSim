/**
 * Core domain types for FUNAAB BetSim.
 * Only what Milestone 1 (auth + wallet foundation) needs is fleshed out here.
 * Match/Market/Bet status unions are declared now (not `status: string`) so
 * later phases build on a stable shape from day one.
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
  balance: number; // Naira; must stay >= 0
  lifetimeWagering: number;
  resetPendingSince: number | null; // epoch ms when balance first hit 0, else null
  updatedAt: number;
}

export const STARTING_BALANCE = 100_000;
export const MINIMUM_STAKE = 1_000;
export const RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Forward-declared for later phases — kept here so the domain model is visible
// from Milestone 1 even though nothing constructs these yet.
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

export type MarketStatus = "draft" | "active" | "locked" | "settled" | "disabled";

export type BetStatus = "open" | "won" | "lost" | "void";
