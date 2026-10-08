import "server-only";
import { shuffled } from "@/lib/casino/rng";
import {
  CASINO_HOUSE_EDGE,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
} from "@/types/casino";

function shuffleIndices(n: number): number[] {
  return shuffled(Array.from({ length: n }, (_, i) => i));
}

/** Fair sequential pick probability → multiplier with house edge */
export function minesMultiplier(mineCount: number, revealCount: number): number {
  if (revealCount < 1) return 1;
  let prob = 1;
  for (let i = 0; i < revealCount; i++) {
    const safe = MINES_GRID - mineCount - i;
    const left = MINES_GRID - i;
    if (safe <= 0 || left <= 0) return 1.01;
    prob *= safe / left;
  }
  if (prob <= 0) return 1.01;
  const mult = (1 / prob) * (1 - CASINO_HOUSE_EDGE);
  return Math.max(1.01, Math.floor(mult * 10000) / 10000);
}

export function resolveMinesRound(opts: {
  stake: number;
  mineCount: number;
  /** Tile indices 0..24 the player opens in one go */
  picks: number[];
}) {
  const { stake, mineCount, picks } = opts;
  const unique = [...new Set(picks)].filter(
    (i) => Number.isInteger(i) && i >= 0 && i < MINES_GRID
  );
  if (unique.length !== picks.length) {
    return { error: "Duplicate or invalid tiles" as const };
  }
  if (unique.length < 1) return { error: "Pick at least one tile" as const };
  if (unique.length > MINES_GRID - mineCount) {
    return { error: "Too many tiles for this mine count" as const };
  }

  const order = shuffleIndices(MINES_GRID);
  const mines = new Set(order.slice(0, mineCount));
  const hit = unique.find((i) => mines.has(i));
  const won = hit === undefined;
  const multiplier = won ? minesMultiplier(mineCount, unique.length) : 0;
  const payout = won ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - stake) * 100) / 100 : -stake;

  return {
    error: null,
    mines: [...mines],
    picks: unique,
    hit: hit ?? null,
    won,
    multiplier,
    payout,
    profit,
  };
}

export function validateMinesInput(raw: {
  stake?: unknown;
  mineCount?: unknown;
  picks?: unknown;
}) {
  const stake = Number(raw.stake);
  const mineCount = Number(raw.mineCount);
  if (!Number.isFinite(stake) || stake <= 0) return { ok: false as const, error: "Invalid stake" };
  if (!Number.isInteger(mineCount) || mineCount < MINES_MIN || mineCount > MINES_MAX) {
    return { ok: false as const, error: `Mines must be ${MINES_MIN}–${MINES_MAX}` };
  }
  if (!Array.isArray(raw.picks)) return { ok: false as const, error: "picks required" };
  const picks = raw.picks.map((p) => Number(p));
  if (picks.some((p) => !Number.isInteger(p))) return { ok: false as const, error: "Invalid picks" };
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    mineCount,
    picks,
  };
}
