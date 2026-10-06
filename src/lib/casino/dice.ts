import "server-only";
import { CASINO_HOUSE_EDGE, type DiceDirection } from "@/types/casino";
import { rollDice100 } from "@/lib/casino/rng";

export function diceWinChance(target: number, direction: DiceDirection): number {
  // target is the threshold on 0–100 scale
  if (direction === "under") return target; // win if roll < target
  return 100 - target; // win if roll > target
}

export function diceMultiplier(target: number, direction: DiceDirection): number {
  const chance = diceWinChance(target, direction);
  if (chance <= 0 || chance >= 100) return 1;
  const fair = 100 / chance;
  const mult = fair * (1 - CASINO_HOUSE_EDGE);
  // 4 decimal places, never below 1.01 when chance allows
  return Math.max(1.01, Math.floor(mult * 10000) / 10000);
}

export function resolveDiceRound(opts: {
  stake: number;
  target: number;
  direction: DiceDirection;
}): {
  roll: number;
  won: boolean;
  multiplier: number;
  payout: number;
  profit: number;
} {
  const { stake, target, direction } = opts;
  const roll = rollDice100();
  const won =
    direction === "under" ? roll < target : roll > target;
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
  // one decimal ok, snap to 2 decimals max
  if (direction !== "under" && direction !== "over") {
    return { ok: false, error: "Direction must be under or over" };
  }
  return {
    ok: true,
    stake: Math.floor(stake * 100) / 100,
    target: Math.floor(target * 100) / 100,
    direction,
  };
}
