import "server-only";
import { randomBytes } from "crypto";
import { PENALTY_MULT, type PenaltySide } from "@/types/casino";

const SIDES: PenaltySide[] = ["left", "center", "right"];

function randSide(): PenaltySide {
  const buf = randomBytes(4);
  return SIDES[buf.readUInt32BE(0) % 3]!;
}

export function resolvePenaltyRound(opts: {
  stake: number;
  shot: PenaltySide;
}) {
  const { stake, shot } = opts;
  const keeper = randSide();
  const won = shot !== keeper;
  const multiplier = won ? PENALTY_MULT : 0;
  const payout = won ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - stake) * 100) / 100 : -stake;
  return { shot, keeper, won, multiplier, payout, profit };
}

export function validatePenaltyInput(raw: {
  stake?: unknown;
  shot?: unknown;
}) {
  const stake = Number(raw.stake);
  const shot = raw.shot;
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  if (shot !== "left" && shot !== "center" && shot !== "right") {
    return { ok: false as const, error: "Shot must be left, center or right" };
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    shot: shot as PenaltySide,
  };
}
