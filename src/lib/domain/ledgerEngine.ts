import type { LedgerEntry, LedgerType, Wallet } from "@/types/domain";
import { availableToBet } from "@/lib/domain/wallet";

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

  return {
    ...raw,
    purchased,
    promo,
    reservedStake,
    reservedWithdrawal,
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

/** Lock stake into reservedStake (does not reduce purchased/promo yet). */
export function applyStakeReserve(
  wallet: Wallet,
  stake: number
): { wallet: Wallet; split: StakeSplit } {
  const w = normalizeWallet(wallet);
  if (stake > availableToBet(w)) {
    throw new Error("Insufficient balance");
  }
  // Split against unreserved funds for bookkeeping
  const unreservedPurchased = w.purchased; // full credits; lock is on reservedStake
  const unreservedPromo = w.promo;
  const split = allocateStake(unreservedPurchased, unreservedPromo, stake);

  const next = syncBalance({
    ...w,
    reservedStake: w.reservedStake + stake,
    lifetimeWagering: w.lifetimeWagering + stake,
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
  });
}

/**
 * Win: release reserve, consume stake split, credit full payout to purchased
 * (winnings are withdrawable).
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
  });
}

/** Void: release reserve only (buckets unchanged). */
export function applyStakeVoid(wallet: Wallet, stake: number): Wallet {
  const w = normalizeWallet(wallet);
  return syncBalance({
    ...w,
    reservedStake: Math.max(0, w.reservedStake - stake),
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
