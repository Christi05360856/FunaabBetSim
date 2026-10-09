import {
  MINIMUM_STAKE,
  PROMO_MIN_LEG_ODDS,
  PROMO_REQUIRED_LEGS,
  type BetLeg,
  type PromoBetRules,
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
 * Cash free to bet OR withdraw: purchased points minus the part of the open
 * stakes that is locked cash (reservedStake minus the promo part) minus
 * pending withdrawals. Tracking the promo part separately means a cash bet can
 * never be mistaken for a promo bet (which used to allow over-withdrawal).
 */
export function cashAvailableForStake(wallet: Pick<
  Wallet,
  "purchased" | "reservedStake" | "reservedWithdrawal" | "reservedPromoStake"
>): number {
  const purchased = wallet.purchased ?? 0;
  const reservedStake = wallet.reservedStake ?? 0;
  const reservedPromo = wallet.reservedPromoStake ?? 0;
  const reservedWithdrawal = wallet.reservedWithdrawal ?? 0;
  const cashLock = Math.max(0, reservedStake - reservedPromo);
  return Math.max(0, purchased - cashLock - reservedWithdrawal);
}

/** Promo points not already locked in open bets. */
export function promoAvailableForStake(wallet: Pick<
  Wallet,
  "promo" | "reservedPromoStake"
>): number {
  return Math.max(0, (wallet.promo ?? 0) - (wallet.reservedPromoStake ?? 0));
}

/** Cash that may leave to bank (promo is never withdrawable). */
export function withdrawableBalance(wallet: Pick<
  Wallet,
  "purchased" | "promo" | "reservedStake" | "reservedWithdrawal" | "reservedPromoStake"
>): number {
  return cashAvailableForStake(wallet);
}

/** Points still to be wagered before a withdrawal is allowed. */
export function turnoverRemaining(wallet: Pick<
  Wallet,
  "turnoverRequired" | "turnoverDone"
>): number {
  return Math.max(0, (wallet.turnoverRequired ?? 0) - (wallet.turnoverDone ?? 0));
}

export function canPlaceStake(balance: number, stake: number): boolean {
  if (!Number.isFinite(balance) || !Number.isFinite(stake)) return false;
  if (stake < MINIMUM_STAKE) return false;
  if (stake > balance) return false;
  return true;
}

/** Default WELCOME-style rules (strict). */
export function defaultWelcomeBetRules(): PromoBetRules {
  return {
    requiredLegs: PROMO_REQUIRED_LEGS,
    minLegOdds: PROMO_MIN_LEG_ODDS,
    require1x2: true,
    terms: "Exactly 5 × 1X2 selections, each odds ≥ 2.00",
  };
}

/** Open rules — any ticket shape. */
export function openPromoBetRules(): PromoBetRules {
  return {
    requiredLegs: null,
    minLegOdds: null,
    require1x2: false,
    terms: null,
  };
}

/**
 * Validate legs against promo bet rules.
 * If rules is null/undefined, falls back to WELCOME defaults (safe).
 */
export function isValidPromoTicket(
  legs: Pick<BetLeg, "odds">[],
  marketTypes?: (string | undefined)[],
  rules?: PromoBetRules | null
): boolean {
  const r = rules ?? defaultWelcomeBetRules();

  if (r.requiredLegs != null && legs.length !== r.requiredLegs) return false;
  if (legs.length < 1) return false;

  if (r.require1x2 && marketTypes && marketTypes.length === legs.length) {
    if (marketTypes.some((t) => t != null && t !== "match_winner")) return false;
  }

  const minOdds = r.minLegOdds;
  if (minOdds != null) {
    if (!legs.every((l) => Number.isFinite(l.odds) && l.odds >= minOdds))
      return false;
  } else {
    if (!legs.every((l) => Number.isFinite(l.odds) && l.odds > 1)) return false;
  }
  return true;
}

export function emptyWallet(uid: string, now = Date.now()): Wallet {
  return {
    uid,
    balance: 0,
    purchased: 0,
    promo: 0,
    reservedStake: 0,
    reservedWithdrawal: 0,
    reservedPromoStake: 0,
    turnoverRequired: 0,
    turnoverDone: 0,
    lifetimeWagering: 0,
    resetPendingSince: null,
    updatedAt: now,
    promoBetRules: null,
  };
}
