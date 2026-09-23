import { describe, expect, it } from "vitest";
import { resolveMatchWinnerSelectionId } from "@/lib/domain/settlement";

describe("resolveMatchWinnerSelectionId", () => {
  it("resolves to home when the home team scores more", () => {
    expect(resolveMatchWinnerSelectionId(2, 1)).toBe("home");
  });

  it("resolves to away when the away team scores more", () => {
    expect(resolveMatchWinnerSelectionId(0, 3)).toBe("away");
  });

  it("resolves to draw on equal scores, including 0-0", () => {
    expect(resolveMatchWinnerSelectionId(1, 1)).toBe("draw");
    expect(resolveMatchWinnerSelectionId(0, 0)).toBe("draw");
  });
});
