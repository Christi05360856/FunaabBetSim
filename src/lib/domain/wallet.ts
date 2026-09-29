import {
  MINIMUM_STAKE,
  PROMO_MIN_LEG_ODDS,
  PROMO_REQUIRED_LEGS,
  type BetLeg,
  type Wallet,
} from "@/types/domain";

/**
 * Available points that can fund a new bet (not locked in stake or withdrawal).
 */
export function availableToBet(wallet: Pick<
  Wallet,
  "purchased" | "promo" | "reservedStake" | "reservedWithdrawal" | "balance"
>): number {
  const fromBuckets =
    (wallet.purchased ?? 0) +
    (wallet.promo ?? 0) -
    (wallet.reservedStake ?? 0) -
    (wallet.reservedWithdrawal ?? 0);
  if (Number.isFinite(fromBuckets)) {
    // Prefer buckets when present; fall back to legacy balance-only wallets.
    if (
      wallet.purchased != null ||
      wallet.promo != null ||
      wallet.reservedStake != null
    ) {
      return Math.max(0, fromBuckets);
    }
  }
  return Math.max(0, wallet.balance ?? 0);
}

/**
 * Points eligible for withdrawal (promo excluded in MVP policy).
 * Phase B will refine proportional win attribution; Phase A is structural only.
 */
export function withdrawableBalance(wallet: Pick<
  Wallet,
  "purchased" | "reservedStake" | "reservedWithdrawal"
>): number {
  return Math.max(
    0,
    (wallet.purchased ?? 0) -
      (wallet.reservedStake ?? 0) -
      (wallet.reservedWithdrawal ?? 0)
  );
}

/**
 * UX pre-check only — server re-validates on place bet.
 */
export function canPlaceStake(balance: number, stake: number): boolean {
  if (!Number.isFinite(balance) || !Number.isFinite(stake)) return false;
  if (stake < MINIMUM_STAKE) return false;
  if (stake > balance) return false;
  return true;
}

/**
 * Promo funding rule: exactly 5 legs, each match_winner (1X2), each odds >= 2.00.
 * Callers pass legs already constrained to match_winner when building promo tickets.
 */
export function isValidPromoTicket(
  legs: Pick<BetLeg, "odds">[],
  marketTypes?: (string | undefined)[]
): boolean {
  if (legs.length !== PROMO_REQUIRED_LEGS) return false;
  if (marketTypes && marketTypes.length === legs.length) {
    if (marketTypes.some((t) => t != null && t !== "match_winner")) return false;
  }
  return legs.every(
    (l) => Number.isFinite(l.odds) && l.odds >= PROMO_MIN_LEG_ODDS
  );
}

/** Empty financial wallet for new registrations (Phase A). */
export function emptyWallet(uid: string, now = Date.now()): Wallet {
  return {
    uid,
    balance: 0,
    purchased: 0,
    promo: 0,
    reservedStake: 0,
    reservedWithdrawal: 0,
    lifetimeWagering: 0,
    resetPendingSince: null,
    updatedAt: now,
  };
}
