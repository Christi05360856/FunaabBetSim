import "server-only";
import { randomBytes } from "crypto";
import {
  CASINO_HOUSE_EDGE,
  HILO_MAX,
  HILO_MIN,
  type HiloChoice,
} from "@/types/casino";

function randCard(): number {
  const span = HILO_MAX - HILO_MIN + 1;
  return HILO_MIN + (randomBytes(4).readUInt32BE(0) % span);
}

export function resolveHiloRound(opts: {
  stake: number;
  current: number;
  choice: HiloChoice;
}) {
  const { stake, current, choice } = opts;
  const next = randCard();
  let won = false;
  if (choice === "higher") won = next > current;
  else won = next < current;
  // Ties lose (house edge)
  const fair =
    choice === "higher"
      ? (HILO_MAX - current) / (HILO_MAX - HILO_MIN)
      : (current - HILO_MIN) / (HILO_MAX - HILO_MIN);
  const p = Math.max(0.08, Math.min(0.9, fair));
  const multiplier = won
    ? Math.floor(((1 - CASINO_HOUSE_EDGE) / p) * 100) / 100
    : 0;
  const payout = won ? Math.floor(stake * multiplier * 100) / 100 : 0;
  const profit = won ? Math.floor((payout - stake) * 100) / 100 : -stake;
  return { current, next, choice, won, multiplier, payout, profit };
}

export function validateHiloInput(raw: {
  stake?: unknown;
  current?: unknown;
  choice?: unknown;
}) {
  const stake = Number(raw.stake);
  const current = Number(raw.current);
  const choice = raw.choice;
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  if (
    !Number.isInteger(current) ||
    current < HILO_MIN ||
    current > HILO_MAX
  ) {
    return { ok: false as const, error: "Invalid card" };
  }
  if (choice !== "higher" && choice !== "lower") {
    return { ok: false as const, error: "Choose higher or lower" };
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    current,
    choice: choice as HiloChoice,
  };
}
