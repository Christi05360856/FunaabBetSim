import "server-only";
import { CASINO_HOUSE_EDGE, type DiceDirection } from "@/types/casino";
import { rollDiceCents } from "@/lib/casino/rng";

/** Win chance in percent. Roll is an integer 0..9999 (hundredths). */
export function diceWinChance(target: number, direction: DiceDirection): number {
  if (direction === "under") return target; // win if roll < target
  return 100 - target; // win if roll >= target
}

export function diceMultiplier(target: number, direction: DiceDirection): number {
  const chance = diceWinChance(target, direction);
  if (chance <= 0 || chance >= 100) return 1;
  const fair = 100 / chance;
  const mult = fair * (1 - CASINO_HOUSE_EDGE);
  // 4 decimal places, never below 1.01 when chance allows
  return Math.max(1.01, Math.floor(mult * 10000) / 10000);
}

/**
 * Exact integer comparison (hundredths) — no float edge cases.
 * under: wins on 0 … targetCents-1      → exactly target% of 10 000 rolls
 * over : wins on targetCents … 9999     → exactly (100 - target)% of 10 000 rolls
 */
export function diceOutcome(
  rollCents: number,
  targetCents: number,
  direction: DiceDirection
): boolean {
  return direction === "under" ? rollCents < targetCents : rollCents >= targetCents;
}

export function resolveDiceRound(opts: {
  stake: number;
  target: number;
  direction: DiceDirection;
  /** Test hook only — production calls omit it. */
  rollCents?: number;
}): {
  roll: number;
  won: boolean;
  multiplier: number;
  payout: number;
  profit: number;
} {
  const { stake, target, direction } = opts;
  const rollCents = opts.rollCents ?? rollDiceCents();
  const roll = rollCents / 100;
  const won = diceOutcome(rollCents, Math.round(target * 100), direction);
  const multiplier = diceMultiplier(target, direction);
  const payout = won ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - stake) * 100) / 100 : -stake;
  return { roll, won, multiplier, payout, profit };
}

export function validateDiceInput(raw: {
  stake?: unknown;
  target?: unknown;
  direction?: unknown;
}): { ok: true; stake: number; target: number; direction: DiceDirection } | { ok: false; error: string } {
  const stake = Number(raw.stake);
  const target = Number(raw.target);
  const direction = raw.direction;

  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, error: "Invalid stake" };
  }
  if (!Number.isFinite(target) || target < 2 || target > 98) {
    return { ok: false, error: "Target must be between 2 and 98" };
  }
  if (direction !== "under" && direction !== "over") {
    return { ok: false, error: "Direction must be under or over" };
  }
  return {
    ok: true,
    stake: Math.floor(stake * 100) / 100,
    // round (not floor): 33.3 * 100 is 3329.999… in floating point
    target: Math.round(target * 100) / 100,
    direction,
  };
}
  
