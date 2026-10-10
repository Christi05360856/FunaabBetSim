import "server-only";
import { makePrng, lagosDayKey, gameSeed } from "@/lib/fair/commit";
import { CASINO_HOUSE_EDGE } from "@/types/casino";

/**
 * Shared Crash: one round every CRASH_ROUND_MS for ALL players, driven only by
 * the clock (no cron, no admin).
 *
 *   |-- betting 8s --|---------- flight up to 22s ----------|
 *
 * The multiplier grows exponentially, m(t) = e^(k t), and k is chosen so that
 * the highest possible crash point (100x) is reached exactly when the round
 * ends. A player who cashes out at ANY multiplier c wins with probability
 * 0.99 / c, so the return is 99% for every strategy.
 */
export const CRASH_ROUND_MS = 30_000;
export const CRASH_BETTING_MS = 8_000;
export const CRASH_MAX_POINT = 100;
export const CRASH_MIN_CASHOUT = 1.01;
const FLIGHT_MS = CRASH_ROUND_MS - CRASH_BETTING_MS;
/** Growth rate per second (≈ 0.209): 100x after the full flight window. */
export const CRASH_GROWTH_PER_SEC = Math.log(CRASH_MAX_POINT) / (FLIGHT_MS / 1000);

export function crashRoundIndex(ms: number = Date.now()): number {
  return Math.floor(ms / CRASH_ROUND_MS);
}

export function crashWindow(index: number) {
  const startsAt = index * CRASH_ROUND_MS;
  const flyAt = startsAt + CRASH_BETTING_MS;
  const endsAt = startsAt + CRASH_ROUND_MS;
  return { startsAt, flyAt, endsAt };
}

/**
 * Crash point from a uniform u in [0, 1). Pure, so it can be tested.
 * P(point >= c) = 0.99 / c for every 1 < c <= 100.
 */
export function crashPointFromUnit(u: number): number {
  const r = Math.min(Math.max(u, 0), 1 - 1e-12);
  const raw = (1 - CASINO_HOUSE_EDGE) / (1 - r);
  const point = Math.floor(raw * 100) / 100;
  return Math.min(Math.max(point, 1), CRASH_MAX_POINT);
}

/** Crash point for a round, fixed by the secret day seed. */
export function crashPointForRound(index: number): number {
  const seed = gameSeed(
    "crash",
    String(index),
    lagosDayKey(index * CRASH_ROUND_MS)
  );
  return crashPointFromUnit(makePrng(seed)());
}

/** Multiplier after `elapsedSec` seconds of flight (before any cap). */
export function multiplierAtElapsed(elapsedSec: number): number {
  return Math.exp(CRASH_GROWTH_PER_SEC * Math.max(0, elapsedSec));
}

/** Seconds of flight until the multiplier reaches `point`. */
export function elapsedAtMultiplier(point: number): number {
  return Math.log(Math.max(1, point)) / CRASH_GROWTH_PER_SEC;
}

/** Multiplier at server time `ms` (never above the crash point). */
export function multiplierAt(ms: number, index: number): number {
  const { flyAt } = crashWindow(index);
  if (ms < flyAt) return 1;
  const raw = multiplierAtElapsed((ms - flyAt) / 1000);
  return Math.min(raw, crashPointForRound(index));
}

export function hasCrashed(ms: number, index: number): boolean {
  const { flyAt } = crashWindow(index);
  if (ms < flyAt) return false;
  const elapsed = (ms - flyAt) / 1000;
  return elapsed >= elapsedAtMultiplier(crashPointForRound(index));
}
