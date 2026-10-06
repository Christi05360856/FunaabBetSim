import "server-only";
import { randomBytes } from "crypto";
import { THIMBLES_CUPS, THIMBLES_MULT } from "@/types/casino";

export function resolveThimblesRound(opts: { stake: number; pick: number }) {
  const { stake, pick } = opts;
  const buf = randomBytes(4);
  const ball = buf.readUInt32BE(0) % THIMBLES_CUPS;
  const won = pick === ball;
  const multiplier = won ? THIMBLES_MULT : 0;
  const payout = won ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - stake) * 100) / 100 : -stake;
  return { ball, pick, won, multiplier, payout, profit };
}

export function validateThimblesInput(raw: {
  stake?: unknown;
  pick?: unknown;
}) {
  const stake = Number(raw.stake);
  const pick = Number(raw.pick);
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  if (!Number.isInteger(pick) || pick < 0 || pick >= THIMBLES_CUPS) {
    return { ok: false as const, error: "Pick a cup (0–2)" };
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    pick,
  };
}
