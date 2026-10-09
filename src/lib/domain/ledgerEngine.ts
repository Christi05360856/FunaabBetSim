import type { LedgerEntry, LedgerType, Wallet } from "@/types/domain";
import { availableToBet, cashAvailableForStake } from "@/lib/domain/wallet";

/**
 * Bucket model:
 * - purchased / promo = credited funds
 * - reservedStake / reservedWithdrawal = locked
 * - available = purchased + promo - reservedStake - reservedWithdrawal
 *
 * Legacy wallets (balance only) → treat balance as purchased.
 */
export function normalizeWallet(raw: Wallet): Wallet {
  const hasBuckets =
    typeof (raw as Wallet).purchased === "number" ||
    typeof (raw as Wallet).promo === "number" ||
    typeof (raw as Wallet).reservedStake === "number";

  if (!hasBuckets) {
    const bal = Number(raw.balance) || 0;
    return {
      ...raw,
      purchased: bal,
      promo: 0,
      reservedStake: 0,
      reservedWithdrawal: 0,
      reservedPromoStake: 0,
      turnoverRequired: Math.max(0, Number(raw.turnoverRequired) || 0),
      turnoverDone: Math.max(0, Number(raw.turnoverDone) || 0),
      balance: bal,
      lifetimeWagering: raw.lifetimeWagering ?? 0,
      resetPendingSince: null,
    };
  }

  const purchased = Number(raw.purchased) || 0;
  const promo = Number(raw.promo) || 0;
  const reservedStake = Number(raw.reservedStake) || 0;
  const reservedWithdrawal = Number(raw.reservedWithdrawal) || 0;
  const balance = Math.max(
    0,
    purchased + promo - reservedStake - reservedWithdrawal
  );

  const reservedPromoStake = Math.min(
    reservedStake,
    Math.max(0, Number(raw.reservedPromoStake) || 0)
  );
  return {
    ...raw,
    purchased,
    promo,
    reservedStake,
    reservedWithdrawal,
    reservedPromoStake,
    turnoverRequired: Math.max(0, Number(raw.turnoverRequired) || 0),
    turnoverDone: Math.max(0, Number(raw.turnoverDone) || 0),
    balance,
    lifetimeWagering: raw.lifetimeWagering ?? 0,
    resetPendingSince: raw.resetPendingSince ?? null,
  };
}

export type StakeSplit = {
  fromPurchased: number;
  fromPromo: number;
};

/**
 * Proportional split for accounting (void return + promo tracking).
 * Uses current free mix: purchased:promo ratio on the wallet.
 */
export function allocateStake(
  purchased: number,
  promo: number,
  stake: number
): StakeSplit {
  const free = purchased + promo;
  if (stake <= 0 || !Number.isFinite(stake)) {
    throw new Error("Invalid stake");
  }
  if (free <= 0) {
    throw new Error("Insufficient balance");
  }
  if (stake > free + 1e-9) {
    throw new Error("Insufficient balance");
  }

  let fromPromo = Math.round((stake * promo) / free);
  let fromPurchased = stake - fromPromo;

  if (fromPurchased > purchased) {
    fromPurchased = purchased;
    fromPromo = stake - fromPurchased;
  }
  if (fromPromo > promo) {
    fromPromo = promo;
    fromPurchased = stake - fromPromo;
  }

  return { fromPurchased, fromPromo };
}

function syncBalance(w: Wallet): Wallet {
  const balance = Math.max(
    0,
    w.purchased + w.promo - w.reservedStake - w.reservedWithdrawal
  );
  return { ...w, balance, resetPendingSince: null, updatedAt: Date.now() };
}

/**
 * Lock stake into reservedStake (does not reduce purchased/promo yet).
 * Pass `forcedSplit` to choose exactly how much comes from cash vs promo;
 * otherwise the legacy proportional split is used.
 * Cash stakes count towards the withdrawal turnover requirement.
 */
export function applyStakeReserve(
  wallet: Wallet,
  stake: number,
  forcedSplit?: StakeSplit
): { wallet: Wallet; split: StakeSplit } {
  const w = normalizeWallet(wallet);
  if (stake > availableToBet(w)) {
    throw new Error("Insufficient balance");
  }
  let split: StakeSplit;
  if (forcedSplit) {
    const { fromPurchased, fromPromo } = forcedSplit;
    const ok =
      fromPurchased >= 0 &&
      fromPromo >= 0 &&
      Math.abs(fromPurchased + fromPromo - stake) < 1e-9;
    if (!ok) throw new Error("Invalid stake split");
    split = { fromPurchased, fromPromo };
  } else {
    split = allocateStake(w.purchased, w.promo, stake);
  }

  const next = syncBalance({
    ...w,
    reservedStake: w.reservedStake + stake,
    reservedPromoStake: (w.reservedPromoStake ?? 0) + split.fromPromo,
    lifetimeWagering: w.lifetimeWagering + stake,
    turnoverDone: (w.turnoverDone ?? 0) + split.fromPurchased,
  });
  return { wallet: next, split };
}

/** Loss: drop reserved stake and consume proportional buckets (GGR). */
export function applyStakeLoss(
  wallet: Wallet,
  stake: number,
  split: StakeSplit
): Wallet {
  const w = normalizeWallet(wallet);
  return syncBalance({
    ...w,
    purchased: Math.max(0, w.purchased - split.fromPurchased),
    promo: Math.max(0, w.promo - split.fromPromo),
    reservedStake: Math.max(0, w.reservedStake - stake),
    reservedPromoStake: Math.max(0, (w.reservedPromoStake ?? 0) - split.fromPromo),
  });
}

/**
 * Win: release reserve, consume stake split, credit `payout` to purchased
 * (winnings are withdrawable). Callers pass the amount to CREDIT: for
 * promo-funded bets that already excludes the promo stake (see computeCredit).
 */
export function applyStakeWin(
  wallet: Wallet,
  stake: number,
  payout: number,
  split: StakeSplit
): Wallet {
  const w = normalizeWallet(wallet);
  return syncBalance({
    ...w,
    purchased: Math.max(0, w.purchased - split.fromPurchased) + payout,
    promo: Math.max(0, w.promo - split.fromPromo),
    reservedStake: Math.max(0, w.reservedStake - stake),
    reservedPromoStake: Math.max(0, (w.reservedPromoStake ?? 0) - split.fromPromo),
  });
}

/** Void: release reserve only (buckets unchanged). */
export function applyStakeVoid(
  wallet: Wallet,
  stake: number,
  fromPromo = 0
): Wallet {
  const w = normalizeWallet(wallet);
  return syncBalance({
    ...w,
    reservedStake: Math.max(0, w.reservedStake - stake),
    reservedPromoStake: Math.max(0, (w.reservedPromoStake ?? 0) - fromPromo),
  });
}

export function buildLedgerEntry(input: {
  id: string;
  uid: string;
  type: LedgerType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  betId?: string | null;
  depositId?: string | null;
  withdrawalId?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
  now?: number;
}): LedgerEntry {
  return {
    id: input.id,
    uid: input.uid,
    type: input.type,
    amount: input.amount,
    balanceBefore: input.balanceBefore,
    balanceAfter: input.balanceAfter,
    status: "success",
    referenceId: input.referenceId ?? null,
    betId: input.betId ?? null,
    depositId: input.depositId ?? null,
    withdrawalId: input.withdrawalId ?? null,
    metadata: input.metadata ?? null,
    createdAt: input.now ?? Date.now(),
  };
}

/**
 * Lock points for a pending withdrawal (from withdrawable purchased only).
 */
export function applyWithdrawalRequest(wallet: Wallet, amount: number): Wallet {
  const w = normalizeWallet(wallet);
  // Same rule as withdrawableBalance (cash locks tracked separately from promo).
  const free = cashAvailableForStake(w);
  if (amount <= 0 || amount > free + 1e-9) {
    throw new Error("Insufficient withdrawable balance");
  }
  return syncBalance({
    ...w,
    reservedWithdrawal: w.reservedWithdrawal + amount,
  });
}

/** Admin rejected / failed: release lock, purchased unchanged. */
export function applyWithdrawalReject(wallet: Wallet, amount: number): Wallet {
  const w = normalizeWallet(wallet);
  return syncBalance({
    ...w,
    reservedWithdrawal: Math.max(0, w.reservedWithdrawal - amount),
  });
}

/** Paid out: release lock and deduct from purchased. */
export function applyWithdrawalComplete(wallet: Wallet, amount: number): Wallet {
  const w = normalizeWallet(wallet);
  return syncBalance({
    ...w,
    purchased: Math.max(0, w.purchased - amount),
    reservedWithdrawal: Math.max(0, w.reservedWithdrawal - amount),
  });
}
