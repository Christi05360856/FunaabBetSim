import "server-only";
import { randomUnit } from "@/lib/casino/rng";
import { CASINO_HOUSE_EDGE } from "@/types/casino";

/**
 * Crash point ≥ 1.00. House edge via 1% instant bust chance + scaled curve.
 */
export function generateCrashPoint(): number {
  if (randomUnit() < CASINO_HOUSE_EDGE) return 1.0;
  const r = Math.max(1e-9, 1 - randomUnit());
  const raw = 0.99 / r;
  const point = Math.floor(raw * 100) / 100;
  return Math.min(Math.max(point, 1.0), 1000);
}

export function resolveCrashRound(opts: { stake: number; cashoutAt: number }) {
  const crashPoint = generateCrashPoint();
  const cashoutAt = Math.floor(opts.cashoutAt * 100) / 100;
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
    cashoutAt: Math.floor(cashoutAt * 100) / 100,
  };
}
