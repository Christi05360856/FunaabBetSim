import { describe, expect, it } from "vitest";
import { checkDob } from "@/lib/compliance/age";
import {
  LIMIT_INCREASE_DELAY_MS,
  checkDepositAgainstLimits,
  isExcluded,
  limitWindowStart,
  requestLimitChange,
  resolveLimit,
  startExclusion,
  type SafePlayState,
} from "@/lib/compliance/safePlay";
import { namesMatch } from "@/lib/kyc/nameMatch";

// Friday 9 Oct 2026, 13:00 in Lagos (12:00 UTC)
const NOW = Date.UTC(2026, 9, 9, 12, 0);
const DAY = 24 * 60 * 60 * 1000;

describe("checkDob", () => {
  it("accepts an adult and reports the age", () => {
    const r = checkDob("2000-05-20", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.age).toBe(26);
  });

  it("accepts someone turning 18 today, rejects someone turning 18 tomorrow", () => {
    expect(checkDob("2008-10-09", NOW).ok).toBe(true);
    expect(checkDob("2008-10-10", NOW).ok).toBe(false);
  });

  it("uses the Lagos date, not UTC (23:30 UTC is already the next day in Lagos)", () => {
    const lateUtc = Date.UTC(2026, 9, 9, 23, 30);
    expect(checkDob("2008-10-10", lateUtc).ok).toBe(true);
  });

  it("rejects future, impossible and malformed dates", () => {
    expect(checkDob("2026-10-10", NOW).ok).toBe(false);
    expect(checkDob("2001-02-31", NOW).ok).toBe(false);
    expect(checkDob("20010101", NOW).ok).toBe(false);
    expect(checkDob("", NOW).ok).toBe(false);
    expect(checkDob(undefined, NOW).ok).toBe(false);
    expect(checkDob("1850-01-01", NOW).ok).toBe(false);
  });
});

describe("deposit limit changes", () => {
  it("setting or lowering a limit applies immediately", () => {
    const first = requestLimitChange(undefined, 5000, NOW);
    expect(first).toEqual({ value: 5000, pending: null });
    const lower = requestLimitChange(first, 3000, NOW);
    expect(lower).toEqual({ value: 3000, pending: null });
  });

  it("raising or removing a limit waits 24 hours", () => {
    const raise = requestLimitChange({ value: 3000, pending: null }, 8000, NOW);
    expect(raise.value).toBe(3000);
    expect(raise.pending?.value).toBe(8000);
    expect(raise.pending?.effectiveAt).toBe(NOW + LIMIT_INCREASE_DELAY_MS);
    expect(resolveLimit(raise, NOW + 1000)).toBe(3000);
    expect(resolveLimit(raise, NOW + LIMIT_INCREASE_DELAY_MS)).toBe(8000);

    const remove = requestLimitChange({ value: 3000, pending: null }, null, NOW);
    expect(remove.pending?.value).toBe(null);
    expect(resolveLimit(remove, NOW)).toBe(3000);
  });

  it("lowering again cancels a pending increase", () => {
    const raise = requestLimitChange({ value: 3000, pending: null }, 8000, NOW);
    const lower = requestLimitChange(raise, 2000, NOW + 1000);
    expect(lower).toEqual({ value: 2000, pending: null });
  });
});

describe("limit windows (Lagos time)", () => {
  it("day, week (Monday) and month start at Lagos midnight", () => {
    expect(limitWindowStart("daily", NOW)).toBe(Date.UTC(2026, 9, 8, 23, 0));
    expect(limitWindowStart("weekly", NOW)).toBe(Date.UTC(2026, 9, 4, 23, 0)); // Mon 5 Oct
    expect(limitWindowStart("monthly", NOW)).toBe(Date.UTC(2026, 8, 30, 23, 0)); // 1 Oct
  });

  it("a Sunday belongs to the week that started the previous Monday", () => {
    const sunday = Date.UTC(2026, 9, 11, 12, 0);
    expect(limitWindowStart("weekly", sunday)).toBe(Date.UTC(2026, 9, 4, 23, 0));
  });
});

describe("checkDepositAgainstLimits", () => {
  const state: SafePlayState = {
    limits: {
      daily: { value: 5000, pending: null },
      monthly: { value: 20000, pending: null },
    },
  };

  it("allows a deposit that fits and blocks one that does not", () => {
    const today = [{ amount: 3000, createdAt: NOW - 60 * 60 * 1000 }];
    expect(checkDepositAgainstLimits(state, today, 2000, NOW)).toBe(null);
    const msg = checkDepositAgainstLimits(state, today, 2500, NOW);
    expect(msg).not.toBe(null);
    expect(msg).toContain("daily");
    expect(msg).toContain("₦2000");
  });

  it("ignores deposits from before the window", () => {
    const old = [{ amount: 5000, createdAt: NOW - 2 * DAY }];
    expect(checkDepositAgainstLimits(state, old, 5000, NOW)).toBe(null);
  });

  it("applies the monthly limit across days", () => {
    const earlier = [{ amount: 18000, createdAt: NOW - 3 * DAY }];
    expect(checkDepositAgainstLimits(state, earlier, 3000, NOW)).not.toBe(null);
  });

  it("no limits means no restriction", () => {
    expect(checkDepositAgainstLimits({}, [], 999999, NOW)).toBe(null);
  });
});

describe("self-exclusion", () => {
  it("starts a break and can only be extended, never shortened", () => {
    const first = startExclusion({}, 30, NOW);
    expect(isExcluded(first, NOW + DAY)).toBe(true);
    expect(isExcluded(first, NOW + 31 * DAY)).toBe(false);

    const shorter = startExclusion(first, 1, NOW + DAY);
    expect(shorter.exclusionUntil).toBe(first.exclusionUntil);

    const longer = startExclusion(first, 90, NOW + DAY);
    expect(Number(longer.exclusionUntil)).toBeGreaterThan(Number(first.exclusionUntil));
  });
});

describe("namesMatch", () => {
  it("matches the same person across order and middle names", () => {
    expect(namesMatch("John Ade Okafor", "OKAFOR JOHN ADE")).toBe(true);
    expect(namesMatch("Ade John", "ADE JOHN OLUWASEUN")).toBe(true);
  });

  it("rejects different people and sharing only one name", () => {
    expect(namesMatch("John Ade Okafor", "MARY BELLO CHIDI")).toBe(false);
    expect(namesMatch("John Ade Okafor", "JOHN BELLO CHIDI")).toBe(false);
    expect(namesMatch("", "JOHN ADE")).toBe(false);
  });
});
