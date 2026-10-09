import { describe, expect, it } from "vitest";
import {
  checkBetLimits,
  computeCredit,
  computePayout,
} from "@/lib/domain/limits";
import {
  cashAvailableForStake,
  emptyWallet,
  promoAvailableForStake,
  turnoverRemaining,
  withdrawableBalance,
} from "@/lib/domain/wallet";
import {
  applyStakeLoss,
  applyStakeReserve,
  applyStakeVoid,
  applyStakeWin,
  applyWithdrawalRequest,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import { findWalletViolations } from "@/lib/domain/walletChecks";
import type { Wallet } from "@/types/domain";

function wallet(over: Partial<Wallet> = {}): Wallet {
  return normalizeWallet({
    ...emptyWallet("u1", 0),
    purchased: 1000,
    promo: 100,
    ...over,
  });
}

describe("payout rounding", () => {
  it("rounds down to whole points without float errors", () => {
    expect(computePayout(100, 1.15)).toBe(115); // 114.99999999999999 in floats
    expect(computePayout(10, 1.234)).toBe(12);
    expect(computePayout(0, 2)).toBe(0);
    expect(computePayout(10, 0)).toBe(0);
  });

  it("free-bet credit excludes the promo stake and respects max win", () => {
    expect(computeCredit(100, 32, 100)).toBe(3100); // 3200 - 100 promo stake
    expect(computeCredit(100, 32, 0)).toBe(3200);
    expect(computeCredit(100, 1.5, 100)).toBe(50);
    expect(computeCredit(100, 1.5, 500)).toBe(0); // never negative
    expect(computeCredit(1000, 5000, 0, 1_000_000)).toBe(1_000_000); // max win cap
  });
});

describe("bet limits", () => {
  it("accepts a normal ticket and rejects over-limit ones", () => {
    expect(checkBetLimits({ stake: 500, legCount: 5, combinedOdds: 30 })).toBe(null);
    expect(checkBetLimits({ stake: 60_000, legCount: 1, combinedOdds: 2 })).not.toBe(null);
    expect(checkBetLimits({ stake: 500, legCount: 16, combinedOdds: 2 })).not.toBe(null);
    expect(checkBetLimits({ stake: 500, legCount: 5, combinedOdds: 5000 })).not.toBe(null);
  });
});

describe("stake locks track cash and promo separately", () => {
  it("a cash bet locks cash only, so it cannot be withdrawn", () => {
    const { wallet: w } = applyStakeReserve(wallet(), 500, {
      fromPurchased: 500,
      fromPromo: 0,
    });
    expect(w.reservedStake).toBe(500);
    expect(w.reservedPromoStake).toBe(0);
    expect(withdrawableBalance(w)).toBe(500);
    expect(cashAvailableForStake(w)).toBe(500);
  });

  it("a promo bet locks promo only and leaves all cash withdrawable", () => {
    const { wallet: w } = applyStakeReserve(wallet(), 100, {
      fromPurchased: 0,
      fromPromo: 100,
    });
    expect(w.reservedPromoStake).toBe(100);
    expect(withdrawableBalance(w)).toBe(1000);
  });

  it("promo points cannot be staked twice", () => {
    const { wallet: w } = applyStakeReserve(wallet(), 100, {
      fromPurchased: 0,
      fromPromo: 100,
    });
    expect(promoAvailableForStake(w)).toBe(0);
  });

  it("rejects a split that does not add up to the stake", () => {
    expect(() =>
      applyStakeReserve(wallet(), 100, { fromPurchased: 50, fromPromo: 20 })
    ).toThrow();
  });
});

describe("settlement keeps the wallet consistent", () => {
  const promoSplit = { fromPurchased: 0, fromPromo: 100 };

  it("promo win pays winnings only (stake not returned)", () => {
    const { wallet: placed } = applyStakeReserve(wallet(), 100, promoSplit);
    const credit = computeCredit(100, 32, 100); // 3100
    const won = applyStakeWin(placed, 100, credit, promoSplit);
    expect(won.purchased).toBe(1000 + 3100);
    expect(won.promo).toBe(0);
    expect(won.reservedStake).toBe(0);
    expect(won.reservedPromoStake).toBe(0);
    expect(findWalletViolations(won)).toEqual([]);
  });

  it("promo loss and void release the locks correctly", () => {
    const { wallet: placed } = applyStakeReserve(wallet(), 100, promoSplit);
    const lost = applyStakeLoss(placed, 100, promoSplit);
    expect(lost.promo).toBe(0);
    expect(lost.purchased).toBe(1000);
    expect(lost.reservedPromoStake).toBe(0);

    const voided = applyStakeVoid(placed, 100, 100);
    expect(voided.promo).toBe(100);
    expect(voided.reservedStake).toBe(0);
    expect(voided.reservedPromoStake).toBe(0);
  });

  it("cash bet: win credits the full payout, loss removes the stake", () => {
    const split = { fromPurchased: 500, fromPromo: 0 };
    const { wallet: placed } = applyStakeReserve(wallet(), 500, split);
    const won = applyStakeWin(placed, 500, computeCredit(500, 2, 0), split);
    expect(won.purchased).toBe(1000 - 500 + 1000);
    const lost = applyStakeLoss(placed, 500, split);
    expect(lost.purchased).toBe(500);
    expect(findWalletViolations(won)).toEqual([]);
    expect(findWalletViolations(lost)).toEqual([]);
  });
});

describe("turnover before withdrawal", () => {
  it("cash stakes count, promo stakes do not", () => {
    const base = wallet({ turnoverRequired: 1000 });
    const { wallet: afterCash } = applyStakeReserve(base, 400, {
      fromPurchased: 400,
      fromPromo: 0,
    });
    expect(turnoverRemaining(afterCash)).toBe(600);
    const { wallet: afterPromo } = applyStakeReserve(afterCash, 100, {
      fromPurchased: 0,
      fromPromo: 100,
    });
    expect(turnoverRemaining(afterPromo)).toBe(600);
  });

  it("old wallets with no requirement are never blocked", () => {
    expect(turnoverRemaining(wallet())).toBe(0);
  });

  it("withdrawal lock uses cash only", () => {
    const { wallet: placed } = applyStakeReserve(wallet(), 700, {
      fromPurchased: 700,
      fromPromo: 0,
    });
    expect(() => applyWithdrawalRequest(placed, 400)).toThrow();
    expect(applyWithdrawalRequest(placed, 300).reservedWithdrawal).toBe(300);
  });
});

describe("findWalletViolations", () => {
  it("flags negative buckets, stale caches and lock mismatches", () => {
    const bad = findWalletViolations(
      { purchased: -5, promo: 0, reservedStake: 0, reservedWithdrawal: 0, balance: 10 },
      { openStake: 50, openPromoStake: 0 }
    ).map((v) => v.code);
    expect(bad).toContain("negative_bucket");
    expect(bad).toContain("balance_cache_mismatch");
    expect(bad).toContain("reserved_stake_mismatch");
  });

  it("passes a healthy wallet", () => {
    const { wallet: w } = applyStakeReserve(wallet(), 200, {
      fromPurchased: 200,
      fromPromo: 0,
    });
    expect(findWalletViolations(w, { openStake: 200, openPromoStake: 0 })).toEqual([]);
  });
});
