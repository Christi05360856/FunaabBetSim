import "server-only";
import { randomBytes } from "crypto";

/**
 * Uniform float in [0, 1).
 * Uses rejection sampling on 32-bit ints for an unbiased unit interval.
 */
export function randomUnit(): number {
  // 53 bits of mantissa precision from two 32-bit draws is overkill;
  // 32-bit / 2^32 is fine for casino demo rolls.
  const buf = randomBytes(4);
  const n = buf.readUInt32BE(0);
  return n / 0x1_0000_0000;
}

/** Roll in [0, 100) with 2 decimal places (0.00 … 99.99). */
export function rollDice100(): number {
  const raw = randomUnit() * 100;
  return Math.floor(raw * 100) / 100;
}

/** Fair coin: 0 heads, 1 tails */
export function coinFlip(): 0 | 1 {
  return randomUnit() < 0.5 ? 0 : 1;
}

