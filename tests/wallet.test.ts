import { describe, expect, it } from "vitest";
import {
  availableToBet,
  canPlaceStake,
  isValidPromoTicket,
  withdrawableBalance,
} from "@/lib/domain/wallet";
import type { Wallet } from "@/types/domain";

describe("canPlaceStake", () => {
  it("rejects a stake below the 2-point minimum", () => {
    expect(canPlaceStake(50_000, 1)).toBe(false);
  });

  it("accepts a stake exactly at the minimum", () => {
    expect(canPlaceStake(50_000, 2)).toBe(true);
  });

  it("rejects a stake greater than the available balance", () => {
    expect(canPlaceStake(500, 1_000)).toBe(false);
  });

  it("accepts a stake that exactly exhausts the balance", () => {
    expect(canPlaceStake(1_000, 1_000)).toBe(true);
  });

  it("rejects non-finite input defensively", () => {
    expect(canPlaceStake(NaN, 1_000)).toBe(false);
    expect(canPlaceStake(50_000, Infinity)).toBe(false);
  });
});

describe("availableToBet / withdrawableBalance", () => {
  const base: Wallet = {
    uid: "u1",
    balance: 0,
    purchased: 500,
    promo: 100,
    reservedStake: 50,
    reservedWithdrawal: 0,
    lifetimeWagering: 0,
    resetPendingSince: null,
    updatedAt: 0,
  };

  it("sums purchased + promo minus reserves", () => {
    expect(availableToBet(base)).toBe(550);
  });

  it("excludes promo from withdrawable", () => {
    expect(withdrawableBalance(base)).toBe(450);
  });
});

describe("isValidPromoTicket", () => {
  it("requires exactly 5 legs at >= 2.00", () => {
    const legs = [
      { odds: 2.0 },
      { odds: 2.1 },
      { odds: 3.0 },
      { odds: 2.0 },
      { odds: 10 },
    ];
    expect(isValidPromoTicket(legs)).toBe(true);
    expect(isValidPromoTicket(legs.slice(0, 4))).toBe(false);
    expect(isValidPromoTicket([...legs, { odds: 2 }])).toBe(false);
    expect(
      isValidPromoTicket([
        { odds: 1.9 },
        { odds: 2 },
        { odds: 2 },
        { odds: 2 },
        { odds: 2 },
      ])
    ).toBe(false);
  });

  it("rejects non-1X2 when market types provided", () => {
    const legs = [
      { odds: 2 },
      { odds: 2 },
      { odds: 2 },
      { odds: 2 },
      { odds: 2 },
    ];
    expect(
      isValidPromoTicket(legs, [
        "match_winner",
        "match_winner",
        "over_under",
        "match_winner",
        "match_winner",
      ])
    ).toBe(false);
  });
});
