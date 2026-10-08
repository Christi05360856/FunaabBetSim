import "server-only";
import { randomUnit } from "@/lib/casino/rng";
import { CASINO_HOUSE_EDGE } from "@/types/casino";

/**
 * Crash point from a uniform u in [0, 1).
 * P(crashPoint >= c) = (1 - edge) / c for every c > 1, so a fixed cash-out
 * target c pays c with probability 0.99 / c → return-to-player is exactly 99%.
 * (No extra "instant bust" roll — that would charge the edge twice.)
 */
export function crashPointFromUnit(u: number): number {
  const r = Math.max(1e-12, 1 - u);
  const raw = (1 - CASINO_HOUSE_EDGE) / r;
  const point = Math.floor(raw * 100) / 100;
  return Math.min(Math.max(point, 1.0), 1000);
}

export function generateCrashPoint(): number {
  return crashPointFromUnit(randomUnit());
}

export function resolveCrashRound(opts: {
  stake: number;
  cashoutAt: number;
  /** Test hook only — production calls omit it. */
  crashPoint?: number;
}) {
  const crashPoint = opts.crashPoint ?? generateCrashPoint();
  const cashoutAt = Math.round(opts.cashoutAt * 100) / 100;
  const won = cashoutAt <= crashPoint && cashoutAt >= 1.01;
  const multiplier = won ? cashoutAt : 0;
  const payout = won ? Math.floor(opts.stake * cashoutAt * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - opts.stake) * 100) / 100 : -opts.stake;
  return { crashPoint, cashoutAt, won, multiplier, payout, profit };
}

export function validateCrashInput(raw: { stake?: unknown; cashoutAt?: unknown }) {
  const stake = Number(raw.stake);
  const cashoutAt = Number(raw.cashoutAt);
  if (!Number.isFinite(stake) || stake <= 0) return { ok: false as const, error: "Invalid stake" };
  if (!Number.isFinite(cashoutAt) || cashoutAt < 1.01 || cashoutAt > 100) {
    return { ok: false as const, error: "Cash out must be between 1.01x and 100x" };
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    cashoutAt: Math.round(cashoutAt * 100) / 100,
  };
}
