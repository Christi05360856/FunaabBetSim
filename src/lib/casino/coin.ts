import "server-only";
import { CASINO_HOUSE_EDGE, type CoinSide } from "@/types/casino";
import { coinFlip } from "@/lib/casino/rng";

export function coinMultiplier(): number {
  // 50% fair → ~1.98 with 1% edge
  return Math.floor(2 * (1 - CASINO_HOUSE_EDGE) * 10000) / 10000;
}

export function resolveCoinRound(opts: { stake: number; pick: CoinSide }) {
  const flip = coinFlip() === 0 ? ("heads" as const) : ("tails" as const);
  const won = flip === opts.pick;
  const multiplier = coinMultiplier();
  const payout = won ? Math.floor(opts.stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - opts.stake) * 100) / 100 : -opts.stake;
  return { flip, won, multiplier, payout, profit };
}

export function validateCoinInput(raw: { stake?: unknown; pick?: unknown }) {
  const stake = Number(raw.stake);
  const pick = raw.pick;
  if (!Number.isFinite(stake) || stake <= 0) return { ok: false as const, error: "Invalid stake" };
  if (pick !== "heads" && pick !== "tails") return { ok: false as const, error: "Pick heads or tails" };
  return { ok: true as const, stake: Math.floor(stake * 100) / 100, pick: pick as CoinSide };
}
