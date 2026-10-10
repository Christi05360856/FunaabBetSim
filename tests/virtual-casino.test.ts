import { describe, expect, it } from "vitest";
import { fairSecret, makePrng, roundSeed } from "@/lib/fair/commit";
import {
  CRASH_GROWTH_PER_SEC,
  CRASH_MAX_POINT,
  crashPointForRound,
  crashPointFromUnit,
  elapsedAtMultiplier,
  multiplierAtElapsed,
} from "@/lib/casino/crashShared";
import {
  generateRoundFromSeed,
  resolveRoundResults,
  selectionWins,
} from "@/lib/virtual/engine";
import { phaseAt, roundWindow } from "@/lib/virtual/schedule";

const TEST_SECRET = "unit-test-secret-0123456789-abcdefghij-XYZ";

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("fair-play secret", () => {
  it("refuses to run in production without a real secret", () => {
    withEnv({ VERCEL_ENV: "production", VIRTUAL_FAIR_SECRET: undefined, NEXT_PHASE: undefined }, () => {
      expect(() => fairSecret()).toThrow();
    });
    withEnv({ VERCEL_ENV: "production", VIRTUAL_FAIR_SECRET: "too-short", NEXT_PHASE: undefined }, () => {
      expect(() => fairSecret()).toThrow();
    });
  });

  it("uses the configured secret and never the old public default", () => {
    withEnv({ VERCEL_ENV: "production", VIRTUAL_FAIR_SECRET: TEST_SECRET }, () => {
      expect(fairSecret()).toBe(TEST_SECRET);
    });
    withEnv({ VERCEL_ENV: undefined, VIRTUAL_FAIR_SECRET: undefined, NEXT_PHASE: undefined }, () => {
      expect(fairSecret()).not.toBe("funaab-dev-fair-secret-change-me");
    });
  });

  it("does not break `next build`", () => {
    withEnv({ VERCEL_ENV: "production", VIRTUAL_FAIR_SECRET: undefined, NEXT_PHASE: "phase-production-build" }, () => {
      expect(fairSecret().length).toBeGreaterThan(10);
    });
  });
});

describe("shared Crash", () => {
  it("returns 99% at every cash-out target", () => {
    const N = 1_000_000;
    for (const target of [1.01, 1.5, 2, 5, 10, 25, 50, 100]) {
      let wins = 0;
      for (let i = 0; i < N; i++) {
        if (crashPointFromUnit((i + 0.5) / N) >= target) wins++;
      }
      const rtp = (wins / N) * target;
      expect(rtp).toBeLessThanOrEqual(0.99 + 0.002);
      expect(rtp).toBeGreaterThanOrEqual(0.975);
    }
  });

  it("reaches the top crash point exactly when the round ends", () => {
    expect(multiplierAtElapsed(0)).toBe(1);
    expect(multiplierAtElapsed(22)).toBeCloseTo(CRASH_MAX_POINT, 6);
    expect(elapsedAtMultiplier(2)).toBeCloseTo(Math.log(2) / CRASH_GROWTH_PER_SEC, 9);
    expect(elapsedAtMultiplier(1)).toBe(0);
  });

  it("round crash points are fixed by the seed and stay in range", () => {
    withEnv({ VIRTUAL_FAIR_SECRET: TEST_SECRET }, () => {
      const a = crashPointForRound(12345);
      const b = crashPointForRound(12345);
      expect(a).toBe(b);
      for (let i = 0; i < 200; i++) {
        const p = crashPointForRound(5000 + i);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(CRASH_MAX_POINT);
      }
    });
  });
});

describe("virtual football schedule", () => {
  it("rounds are 3 minutes, betting closes 30s before the end", () => {
    const t = Date.UTC(2026, 9, 9, 12, 0, 10);
    const p = phaseAt(t);
    const w = roundWindow(p.index);
    expect(w.endsAt - w.startsAt).toBe(180_000);
    expect(p.phase).toBe("betting");
    expect(phaseAt(w.kickoffAt).phase).toBe("live");
    expect(phaseAt(w.endsAt).phase).toBe("betting"); // the next round has begun
    expect(phaseAt(w.endsAt).index).toBe(p.index + 1);
  });
});

describe("virtual football rounds", () => {
  it("the same seed always gives the same board and the same results", () => {
    withEnv({ VIRTUAL_FAIR_SECRET: TEST_SECRET }, () => {
      const seed = roundSeed("2026-10-09", 777);
      const a = generateRoundFromSeed(seed);
      const b = generateRoundFromSeed(seed);
      expect(a).toEqual(b);
      expect(resolveRoundResults(seed, a)).toEqual(resolveRoundResults(seed, b));
      const other = generateRoundFromSeed(roundSeed("2026-10-09", 778));
      expect(JSON.stringify(other)).not.toBe(JSON.stringify(a));
    });
  });

  it("odds keep the margin: no pick is worth more than its stake", () => {
    function pois(l: number, k: number) {
      let p = Math.exp(-l);
      for (let i = 1; i <= k; i++) p *= l / i;
      return p;
    }
    let worst = 0;
    withEnv({ VIRTUAL_FAIR_SECRET: TEST_SECRET }, () => {
      for (let n = 0; n < 40; n++) {
        const board = generateRoundFromSeed(roundSeed("2026-10-09", 9000 + n));
        for (const m of board) {
          const eh = 1.25 * m.homeStrength * (1 / m.awayStrength);
          const ea = 1.1 * m.awayStrength * (1 / m.homeStrength);
          let pH = 0, pD = 0, pA = 0, pOver = 0, pBoth = 0;
          for (let i = 0; i <= 25; i++) {
            for (let j = 0; j <= 25; j++) {
              const p = pois(eh, i) * pois(ea, j);
              if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
              if (i + j >= 3) pOver += p;
              if (i > 0 && j > 0) pBoth += p;
            }
          }
          const evs = [
            pH * m.odds1x2.home,
            pD * m.odds1x2.draw,
            pA * m.odds1x2.away,
            pOver * m.oddsOu25.over,
            (1 - pOver) * m.oddsOu25.under,
            pBoth * m.oddsBtts.yes,
            (1 - pBoth) * m.oddsBtts.no,
          ];
          worst = Math.max(worst, ...evs);
        }
      }
    });
    // Rounding to 2 decimals can add a hair; a real edge would be far above this.
    expect(worst).toBeLessThanOrEqual(1.01);
  });

  it("selectionWins judges each market correctly", () => {
    const s = { homeGoals: 2, awayGoals: 1 };
    expect(selectionWins(s, { market: "1x2", pick: "home" })).toBe(true);
    expect(selectionWins(s, { market: "1x2", pick: "draw" })).toBe(false);
    expect(selectionWins(s, { market: "ou25", pick: "over" })).toBe(true);
    expect(selectionWins(s, { market: "btts", pick: "yes" })).toBe(true);
    expect(selectionWins({ homeGoals: 0, awayGoals: 0 }, { market: "ou25", pick: "under" })).toBe(true);
  });

  it("the seeded random stream is stable", () => {
    const r1 = makePrng("abc");
    const r2 = makePrng("abc");
    for (let i = 0; i < 50; i++) expect(r1()).toBe(r2());
  });
});
