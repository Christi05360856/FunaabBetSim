import "server-only";
import { WHEEL_SEGMENTS } from "@/types/casino";
import { randomIndex } from "@/lib/casino/rng";

export function resolveWheelRound(opts: { stake: number }) {
  const idx = randomIndex(WHEEL_SEGMENTS.length);
  const multiplier: number = WHEEL_SEGMENTS[idx] ?? 0;
  const won = multiplier > 0;
  const payout = won ? Math.floor(opts.stake * multiplier * 100) / 100 : 0;
  const profit = won
    ? Math.floor((payout - opts.stake) * 100) / 100
    : -opts.stake;
  return { segment: idx, multiplier, won, payout, profit };
}

export function validateWheelInput(raw: { stake?: unknown }) {
  const stake = Number(raw.stake);
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  return { ok: true as const, stake: Math.floor(stake * 100) / 100 };
}
