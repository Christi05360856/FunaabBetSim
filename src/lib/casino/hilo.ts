import "server-only";
import {
  CASINO_HOUSE_EDGE,
  HILO_MAX,
  HILO_MIN,
  type HiloChoice,
} from "@/types/casino";
import { randomIndex } from "@/lib/casino/rng";

const CARD_COUNT = HILO_MAX - HILO_MIN + 1; // 13

function randCard(): number {
  return HILO_MIN + randomIndex(CARD_COUNT);
}

/**
 * Exact win probability. Next card is uniform over 13 values and a tie loses,
 * so "higher" wins on (13 - current) cards and "lower" on (current - 1) cards.
 */
export function hiloWinProbability(current: number, choice: HiloChoice): number {
  const winningCards =
    choice === "higher" ? HILO_MAX - current : current - HILO_MIN;
  return winningCards / CARD_COUNT;
}

/**
 * Multiplier = 0.99 / true probability (floored to 2 dp), so every
 * current-card / choice combination returns ≤ 99%. 0 means "cannot win".
 */
export function hiloMultiplier(current: number, choice: HiloChoice): number {
  const p = hiloWinProbability(current, choice);
  if (p <= 0) return 0;
  return Math.floor(((1 - CASINO_HOUSE_EDGE) / p) * 100) / 100;
}

export function resolveHiloRound(opts: {
  stake: number;
  current: number;
  choice: HiloChoice;
  /** Test hook only — production calls omit it. */
  next?: number;
}) {
  const { stake, current, choice } = opts;
  const next = opts.next ?? randCard();
  const won = choice === "higher" ? next > current : next < current;
  const multiplier = won ? hiloMultiplier(current, choice) : 0;
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
  if (hiloWinProbability(current, choice) <= 0) {
    return {
      ok: false as const,
      error:
        choice === "higher"
          ? "Nothing is higher than a King — choose lower"
          : "Nothing is lower than an Ace — choose higher",
    };
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    current,
    choice: choice as HiloChoice,
  };
}
