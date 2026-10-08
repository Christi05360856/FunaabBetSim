import "server-only";
import { randomBytes } from "crypto";
import type { PenaltySide } from "@/types/casino";
import { PENALTY_LADDER } from "@/lib/casino/penaltyLadder";

const SIDES: PenaltySide[] = ["left", "center", "right"];
const MAX_SHOTS = PENALTY_LADDER.length;

function randSide(): PenaltySide {
  return SIDES[randomBytes(4).readUInt32BE(0) % 3]!;
}

/**
 * Penalty Series:
 * - the number of shots sent is the player's target (1..5);
 * - every shot must score, the first save ends the run;
 * - paying the ladder multiplier for that target, otherwise 0.
 */
export function resolvePenaltySeriesRound(opts: {
  stake: number;
  shots: PenaltySide[];
}) {
  const { stake, shots } = opts;
  const target = shots.length;

  const keepers: PenaltySide[] = [];
  const results: boolean[] = [];
  let goals = 0;

  for (let i = 0; i < target; i++) {
    const keeper = randSide();
    const scored = shots[i] !== keeper;

    keepers.push(keeper);
    results.push(scored);

    if (!scored) break;
    goals += 1;
  }

  const completed = goals === target;
  const multiplier = completed ? (PENALTY_LADDER[target - 1] ?? 0) : 0;
  const payout =
    completed && multiplier > 0
      ? Math.floor(stake * multiplier * 100) / 100
      : 0;
  const profit = Math.floor((payout - stake) * 100) / 100;

  return {
    shots,
    keepers,
    results,
    goals,
    completed,
    multiplier,
    payout,
    profit,
    won: completed,
  };
}

export function validatePenaltySeriesInput(raw: {
  stake?: unknown;
  shots?: unknown;
}) {
  const stake = Number(raw.stake);

  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }

    if (!Array.isArray(raw.shots) || raw.shots.length !== MAX_SHOTS) {
    return {
      ok: false as const,
      error: `Provide exactly ${MAX_SHOTS} shots`,
    };
    }

  const shots: PenaltySide[] = [];

  for (const s of raw.shots) {
    if (s !== "left" && s !== "center" && s !== "right") {
      return {
        ok: false as const,
        error: "Each shot must be left, center or right",
      };
    }
    shots.push(s);
  }

  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    shots,
  };
}
