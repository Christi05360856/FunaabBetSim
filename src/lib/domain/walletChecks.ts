import type { Wallet } from "@/types/domain";

export type WalletViolation = { code: string; detail: string };

const EPS = 0.01;

/**
 * Read-only integrity checks for a stored wallet document.
 * `openStake` / `openPromoStake` are the sums over that user's open bets;
 * pass them to also cross-check the locks against the bets themselves.
 */
export function findWalletViolations(
  w: Partial<Wallet>,
  open?: { openStake: number; openPromoStake: number }
): WalletViolation[] {
  const out: WalletViolation[] = [];
  const n = (v: unknown) => Number(v ?? 0) || 0;

  const purchased = n(w.purchased);
  const promo = n(w.promo);
  const reservedStake = n(w.reservedStake);
  const reservedWithdrawal = n(w.reservedWithdrawal);
  const reservedPromoStake = n(w.reservedPromoStake);

  const named: [string, number][] = [
    ["purchased", purchased],
    ["promo", promo],
    ["reservedStake", reservedStake],
    ["reservedWithdrawal", reservedWithdrawal],
    ["reservedPromoStake", reservedPromoStake],
    ["turnoverRequired", n(w.turnoverRequired)],
    ["turnoverDone", n(w.turnoverDone)],
  ];
  for (const [name, value] of named) {
    if (value < -EPS) {
      out.push({ code: "negative_bucket", detail: `${name} is ${value}` });
    }
  }

  if (reservedPromoStake > reservedStake + EPS) {
    out.push({
      code: "promo_lock_exceeds_stake_lock",
      detail: `reservedPromoStake ${reservedPromoStake} > reservedStake ${reservedStake}`,
    });
  }

  if (reservedStake + reservedWithdrawal > purchased + promo + EPS) {
    out.push({
      code: "locks_exceed_funds",
      detail: `locks ${reservedStake + reservedWithdrawal} > funds ${purchased + promo}`,
    });
  }

  const expectedBalance = Math.max(
    0,
    purchased + promo - reservedStake - reservedWithdrawal
  );
  if (w.balance !== undefined && Math.abs(n(w.balance) - expectedBalance) > EPS) {
    out.push({
      code: "balance_cache_mismatch",
      detail: `balance ${n(w.balance)} but buckets give ${expectedBalance}`,
    });
  }

  if (open) {
    if (Math.abs(reservedStake - open.openStake) > EPS) {
      out.push({
        code: "reserved_stake_mismatch",
        detail: `wallet locks ${reservedStake} but open bets total ${open.openStake}`,
      });
    }
    if (Math.abs(reservedPromoStake - open.openPromoStake) > EPS) {
      out.push({
        code: "reserved_promo_mismatch",
        detail: `wallet promo lock ${reservedPromoStake} but open bets use ${open.openPromoStake}`,
      });
    }
  }

  return out;
}
