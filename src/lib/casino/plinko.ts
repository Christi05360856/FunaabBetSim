import "server-only";
import { randomBytes } from "crypto";
import { PLINKO_ROWS, PLINKO_SLOTS } from "@/types/casino";

function unit(): number {
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

/**
 * Simulate ball path: at each row, go left (0) or right (1) with 50%.
 * Final slot index = number of right moves (0..ROWS).
 */
export function resolvePlinkoRound(opts: { stake: number }) {
  const { stake } = opts;
  const path: number[] = [];
  let rights = 0;
  for (let r = 0; r < PLINKO_ROWS; r++) {
    const right = unit() < 0.5 ? 1 : 0;
    path.push(right);
    rights += right;
  }
  const slot = rights;
  const multiplier = PLINKO_SLOTS[slot] ?? 0;
  const payout =
    multiplier > 0 ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const won = payout > 0;
  const profit = Math.floor((payout - stake) * 100) / 100;
  return { path, slot, multiplier, payout, profit, won };
}

export function validatePlinkoInput(raw: { stake?: unknown }) {
  const stake = Number(raw.stake);
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  return { ok: true as const, stake: Math.floor(stake * 100) / 100 };
}
