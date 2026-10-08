import "server-only";
import { randomBytes } from "crypto";
import {
  KENO_DRAW,
  KENO_MAX_PICKS,
  KENO_PAYTABLE,
  KENO_POOL,
} from "@/types/casino";

function shuffleDraw(): number[] {
  const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, KENO_DRAW).sort((a, b) => a - b);
}

export function resolveKenoRound(opts: {
  stake: number;
  picks: number[];
}) {
  const { stake, picks } = opts;
  const drawn = shuffleDraw();
  const pickSet = new Set(picks);
  const hits = drawn.filter((n) => pickSet.has(n)).length;
  const table = KENO_PAYTABLE[picks.length] ?? {};
  const multiplier = table[hits] ?? 0;
  const payout =
    multiplier > 0 ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const won = payout > 0;
  const profit = Math.floor((payout - stake) * 100) / 100;
  return { picks, drawn, hits, multiplier, payout, profit, won };
}

export function validateKenoInput(raw: {
  stake?: unknown;
  picks?: unknown;
}) {
  const stake = Number(raw.stake);
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  if (!Array.isArray(raw.picks)) {
    return { ok: false as const, error: "Pick at least 1 number" };
  }
  const nums = raw.picks.map((n) => Number(n));
  if (nums.length < 1 || nums.length > KENO_MAX_PICKS) {
    return {
      ok: false as const,
      error: `Select 1–${KENO_MAX_PICKS} numbers`,
    };
  }
  const set = new Set<number>();
  for (const n of nums) {
    if (!Number.isInteger(n) || n < 1 || n > KENO_POOL) {
      return { ok: false as const, error: `Numbers must be 1–${KENO_POOL}` };
    }
    if (set.has(n)) {
      return { ok: false as const, error: "Duplicate number" };
    }
    set.add(n);
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    picks: [...set].sort((a, b) => a - b),
  };
}
