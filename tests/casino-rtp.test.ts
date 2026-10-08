import { describe, expect, it } from "vitest";
import {
  KENO_PAYTABLE,
  KENO_DRAW,
  KENO_POOL,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
  PENALTY_MULT,
  PLINKO_ROWS,
  PLINKO_SLOTS,
  THIMBLES_CUPS,
  THIMBLES_MULT,
  WHEEL_SEGMENTS,
} from "@/types/casino";
import { PENALTY_LADDER } from "@/lib/casino/penaltyLadder";
import { validatePenaltySeriesInput } from "@/lib/casino/penaltySeries";
import { crashPointFromUnit } from "@/lib/casino/crash";
import { diceMultiplier, diceOutcome, diceWinChance } from "@/lib/casino/dice";
import {
  hiloMultiplier,
  hiloWinProbability,
  validateHiloInput,
} from "@/lib/casino/hilo";
import { minesMultiplier } from "@/lib/casino/mines";
import { randomIndex, shuffled } from "@/lib/casino/rng";

/**
 * Every game must return between MIN_RTP and MAX_RTP of stakes over the long
 * run. MAX_RTP is the advertised 99%; anything above it means players beat
 * the house. These tests use exact odds (no random sampling), so they are
 * deterministic and fail the moment someone edits a paytable carelessly.
 */
const MAX_RTP = 0.99 + 1e-9;
const MIN_RTP = 0.94;

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

describe("fixed-odds games", () => {
  it("wheel: average segment multiplier stays within RTP bounds", () => {
    const mean =
      WHEEL_SEGMENTS.reduce<number>((a, b) => a + b, 0) / WHEEL_SEGMENTS.length;
    expect(mean).toBeLessThanOrEqual(MAX_RTP);
    expect(mean).toBeGreaterThanOrEqual(MIN_RTP);
  });

  it("penalty: 2-in-3 scoring chance x multiplier", () => {
    const rtp = (2 / 3) * PENALTY_MULT;
    expect(rtp).toBeLessThanOrEqual(MAX_RTP);
    expect(rtp).toBeGreaterThanOrEqual(MIN_RTP);
  });

  it("thimbles: 1-in-3 chance x multiplier", () => {
    const rtp = (1 / THIMBLES_CUPS) * THIMBLES_MULT;
    expect(rtp).toBeLessThanOrEqual(MAX_RTP);
    expect(rtp).toBeGreaterThanOrEqual(MIN_RTP);
  });

  it("penalty series: every ladder step is within RTP bounds", () => {
    expect(PENALTY_LADDER).toHaveLength(5);
    PENALTY_LADDER.forEach((mult, i) => {
      const rtp = mult * Math.pow(2 / 3, i + 1);
      expect(rtp).toBeLessThanOrEqual(MAX_RTP);
      expect(rtp).toBeGreaterThanOrEqual(0.97);
    });
  });

  it("penalty series: accepts 1–5 shots, rejects 0 and 6", () => {
    const shots = (n: number) => Array.from({ length: n }, () => "left");
    expect(validatePenaltySeriesInput({ stake: 10, shots: shots(1) }).ok).toBe(true);
    expect(validatePenaltySeriesInput({ stake: 10, shots: shots(5) }).ok).toBe(true);
    expect(validatePenaltySeriesInput({ stake: 10, shots: shots(0) }).ok).toBe(false);
    expect(validatePenaltySeriesInput({ stake: 10, shots: shots(6) }).ok).toBe(false);
  });

  it("plinko: binomial landing odds x slot multipliers", () => {
    let rtp = 0;
    for (let k = 0; k <= PLINKO_ROWS; k++) {
      rtp += (choose(PLINKO_ROWS, k) / Math.pow(2, PLINKO_ROWS)) * (PLINKO_SLOTS[k] ?? 0);
    }
    expect(rtp).toBeLessThanOrEqual(MAX_RTP);
    expect(rtp).toBeGreaterThanOrEqual(MIN_RTP);
  });

  it("keno: every pick size returns 95–99% and prizes rise with hits", () => {
    const total = choose(KENO_POOL, KENO_DRAW);
    for (const [kStr, row] of Object.entries(KENO_PAYTABLE)) {
      const picks = Number(kStr);
      let rtp = 0;
      let lastMult = 0;
      const hitsSorted = Object.keys(row)
        .map(Number)
        .sort((a, b) => a - b);
      for (const hits of hitsSorted) {
        const mult = row[hits] ?? 0;
        expect(mult).toBeGreaterThan(lastMult);
        lastMult = mult;
        const p =
          (choose(picks, hits) * choose(KENO_POOL - picks, KENO_DRAW - hits)) / total;
        rtp += p * mult;
      }
      expect(rtp).toBeLessThanOrEqual(MAX_RTP);
      expect(rtp).toBeGreaterThanOrEqual(0.95);
    }
  });
});

describe("crash", () => {
  it("returns 99% at every cash-out target (single house edge)", () => {
    const N = 1_000_000;
    for (const target of [1.01, 1.5, 2, 5, 10, 50, 100]) {
      let wins = 0;
      for (let i = 0; i < N; i++) {
        if (crashPointFromUnit((i + 0.5) / N) >= target) wins++;
      }
      const rtp = (wins / N) * target;
      expect(rtp).toBeLessThanOrEqual(0.99 + 0.002);
      expect(rtp).toBeGreaterThanOrEqual(0.98);
    }
  });
});

describe("dice", () => {
  it("win chance is exact for both directions (enumerating all 10 000 rolls)", () => {
    for (const target of [2, 10, 25, 33.3, 50, 75, 90, 98]) {
      for (const direction of ["under", "over"] as const) {
        const targetCents = Math.round(target * 100);
        let wins = 0;
        for (let roll = 0; roll < 10000; roll++) {
          if (diceOutcome(roll, targetCents, direction)) wins++;
        }
        const chancePct = wins / 100;
        expect(chancePct).toBeCloseTo(diceWinChance(target, direction), 9);
        const rtp = (wins / 10000) * diceMultiplier(target, direction);
        expect(rtp).toBeLessThanOrEqual(MAX_RTP);
        expect(rtp).toBeGreaterThanOrEqual(0.985);
      }
    }
  });
});

describe("hi-lo", () => {
  it("no current-card / choice pairing beats the house", () => {
    for (let current = 1; current <= 13; current++) {
      for (const choice of ["higher", "lower"] as const) {
        const p = hiloWinProbability(current, choice);
        if (p <= 0) continue;
        const rtp = p * hiloMultiplier(current, choice);
        expect(rtp).toBeLessThanOrEqual(MAX_RTP);
        expect(rtp).toBeGreaterThanOrEqual(0.95);
      }
    }
  });

  it("rejects impossible picks", () => {
    expect(validateHiloInput({ stake: 10, current: 13, choice: "higher" }).ok).toBe(false);
    expect(validateHiloInput({ stake: 10, current: 1, choice: "lower" }).ok).toBe(false);
    expect(validateHiloInput({ stake: 10, current: 7, choice: "higher" }).ok).toBe(true);
  });
});

describe("mines", () => {
  it("multiplier x survival probability never exceeds 99%", () => {
    for (let mines = MINES_MIN; mines <= MINES_MAX; mines++) {
      let prob = 1;
      for (let reveals = 1; reveals <= MINES_GRID - mines; reveals++) {
        const i = reveals - 1;
        prob *= (MINES_GRID - mines - i) / (MINES_GRID - i);
        const rtp = prob * minesMultiplier(mines, reveals);
        expect(rtp).toBeLessThanOrEqual(MAX_RTP);
        expect(rtp).toBeGreaterThanOrEqual(0.98);
      }
    }
  });
});

describe("rng helpers", () => {
  it("randomIndex stays in range and rejects bad input", () => {
    for (let i = 0; i < 2000; i++) {
      const v = randomIndex(12);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(12);
    }
    expect(() => randomIndex(0)).toThrow();
    expect(() => randomIndex(1.5)).toThrow();
  });

  it("shuffled keeps every element exactly once", () => {
    const input = Array.from({ length: 25 }, (_, i) => i);
    const out = shuffled(input);
    expect(out).toHaveLength(25);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});
