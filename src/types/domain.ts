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

/**
 * Wallet buckets (Phase A financial model).
 * `balance` is a cached mirror of available-to-bet for legacy UI;
 * the ledger is the source of truth once Phase B writes it on every move.
 */
export interface Wallet {
  uid: string;
  /** Cached available to bet: purchased + promo - reservedStake - reservedWithdrawal */
  balance: number;
  /** Points from verified Naira deposits (1:1). */
  purchased: number;
  /** Promo points — spend only under promo bet rules; not withdrawable as cash. */
  promo: number;
  /** Stake locked in open bets. */
  reservedStake: number;
  /** Amount locked in pending withdrawals. */
  reservedWithdrawal: number;
  lifetimeWagering: number;
  /** @deprecated Play-money self-reset removed; always null. */
  resetPendingSince: number | null;
  updatedAt: number;
}

/** @deprecated Play money removed — new accounts start at 0. */
export const STARTING_BALANCE = 0;

/** Minimum stake in points (1 pt = ₦1). */
export const MINIMUM_STAKE = 2;

/** Min Naira / points for a deposit or point purchase. */
export const MIN_DEPOSIT_NGN = 200;
export const MIN_PURCHASE_POINTS = 200;

/** Withdrawal limits (points = Naira at 1:1). */
export const MIN_WITHDRAWAL = 1_000;
export const MAX_WITHDRAWAL = 50_000;

/** Welcome promo: +100 pts, max 100 redemptions platform-wide. */
export const WELCOME_PROMO_CODE = "WELCOME100";
export const WELCOME_BONUS_POINTS = 100;
export const WELCOME_MAX_REDEMPTIONS = 100;

/** Promo stake rule: exactly 5 × 1X2 legs, each odds >= 2.00 */
export const PROMO_REQUIRED_LEGS = 5;
export const PROMO_MIN_LEG_ODDS = 2.0;

/** 1 point = ₦1 — fixed, no arbitrary conversion. */
export const POINTS_PER_NAIRA = 1;

/** @deprecated Self-reset removed in financial MVP. */
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

// ---- Financial ledger (immutable) ----------------------------------------

export type LedgerType =
  | "DEPOSIT_INITIATED"
  | "DEPOSIT_SUCCESS"
  | "PURCHASED_POINTS_CREDIT"
  | "PROMO_POINTS_CREDIT"
  | "BET_STAKE_RESERVE"
  | "BET_WIN_SETTLEMENT"
  | "BET_LOSS_SETTLEMENT"
  | "BET_VOID_REFUND"
  | "WITHDRAWAL_REQUEST"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_COMPLETED"
  | "WITHDRAWAL_REJECTED"
  | "WITHDRAWAL_FAILED"
  | "ADMIN_ADJUSTMENT";

/** Legacy play-money types kept for historical rows; new code uses LedgerType. */
export type TransactionType =
  | "debit_bet"
  | "payout"
  | "refund"
  | "reset"
  | LedgerType;

export type LedgerEntryStatus =
  | "pending"
  | "success"
  | "failed"
  | "reversed";

/**
 * Append-only financial record. Prefer collection `ledger`.
 * `transactions` may still hold legacy play-money rows until cutover wipe.
 */
export interface LedgerEntry {
  id: string;
  uid: string;
  type: LedgerType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: LedgerEntryStatus;
  referenceId: string | null;
  betId: string | null;
  depositId: string | null;
  withdrawalId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

/** @deprecated Prefer LedgerEntry — shape kept so existing readers compile. */
export interface Transaction {
  id: string;
  uid: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  balanceBefore?: number;
  betId: string | null;
  status?: LedgerEntryStatus;
  referenceId?: string | null;
  createdAt: number;
}

// ---- Deposits ------------------------------------------------------------

export type DepositStatus =
  | "initiated"
  | "pending"
  | "success"
  | "failed"
  | "abandoned";

export interface Deposit {
  id: string;
  /** Same as id — Flutterwave tx_ref. */
  txRef: string;
  uid: string;
  amountNgn: number;
  points: number;
  promoCode: string | null;
  status: DepositStatus;
  flwTransactionId: string | null;
  flwRef: string | null;
  createdAt: number;
  completedAt: number | null;
}

// ---- Promotions ----------------------------------------------------------

export type PromotionRuleType = "welcome_fixed" | "custom";

export interface Promotion {
  id: string;
  code: string;
  ruleType: PromotionRuleType;
  bonusPoints: number;
  minDepositNgn: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  exhaustedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PromoRedemption {
  id: string;
  uid: string;
  code: string;
  depositId: string;
  pointsCredited: number;
  createdAt: number;
}

// ---- Withdrawals ---------------------------------------------------------

export type WithdrawalStatus =
  | "requested"
  | "pending_review"
  | "approved"
  | "processing"
  | "completed"
  | "rejected"
  | "payment_failed";

export interface Withdrawal {
  id: string;
  uid: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  status: WithdrawalStatus;
  adminNote: string | null;
  flwTransferId: string | null;
  createdAt: number;
  updatedAt: number;
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
