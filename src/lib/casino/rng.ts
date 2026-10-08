import "server-only";
import { randomBytes, randomInt } from "crypto";

/**
 * Uniform float in [0, 1) with 53 bits of precision.
 */
export function randomUnit(): number {
  const buf = randomBytes(8);
  const hi = buf.readUInt32BE(0) >>> 5; // top 27 bits
  const lo = buf.readUInt32BE(4) >>> 6; // top 26 bits
  return (hi * 67108864 + lo) / 9007199254740992;
}

/**
 * Unbiased integer in [0, n).
 * Uses crypto.randomInt (rejection sampling) — never `x % n` on random bytes,
 * which skews results whenever n does not divide 2^32.
 */
export function randomIndex(n: number): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("randomIndex: n must be a positive integer");
  }
  return randomInt(n);
}

/** Unbiased Fisher–Yates shuffle. Returns a new array. */
export function shuffled<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = arr[i] as T;
    const b = arr[j] as T;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

/** Dice roll as an integer 0..9999 (hundredths of a point). */
export function rollDiceCents(): number {
  return randomInt(10000);
}

/** Roll in [0, 100) with 2 decimal places (0.00 … 99.99). */
export function rollDice100(): number {
  return rollDiceCents() / 100;
}

/** Fair coin: 0 heads, 1 tails */
export function coinFlip(): 0 | 1 {
  return randomInt(2) === 0 ? 0 : 1;
}
