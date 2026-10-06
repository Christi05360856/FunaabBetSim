import "server-only";
import { randomBytes } from "crypto";
import { WHEEL_SEGMENTS } from "@/types/casino";

export function resolveWheelRound(opts: { stake: number }) {
  const buf = randomBytes(4);
  const idx = buf.readUInt32BE(0) % WHEEL_SEGMENTS.length;
  const multiplier = WHEEL_SEGMENTS[idx]!;
  const won = multiplier > 0;
  const payout = won ? Math.floor(opts.stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - opts.stake) * 100) / 100 : -opts.stake;
  return { segment: idx, multiplier, won, payout, profit };
}

export function validateWheelInput(raw: { stake?: unknown }) {
  const stake = Number(raw.stake);
  if (!Number.isFinite(stake) || stake <= 0) return { ok: false as const, error: "Invalid stake" };
  return { ok: true as const, stake: Math.floor(stake * 100) / 100 };
}
