import { describe, expect, it } from "vitest";
import { canPlaceStake } from "@/lib/domain/wallet";

describe("canPlaceStake", () => {
  it("rejects a stake below the ₦1,000 minimum", () => {
    expect(canPlaceStake(50_000, 999)).toBe(false);
  });

  it("accepts a stake exactly at the minimum", () => {
    expect(canPlaceStake(50_000, 1_000)).toBe(true);
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
