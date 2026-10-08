import "server-only";
import { randomBytes } from "crypto";
import {
  PENALTY_SERIES_MULT,
  PENALTY_SERIES_SHOTS,
  type PenaltySide,
} from "@/types/casino";

const SIDES: PenaltySide[] = ["left", "center", "right"];

function randSide(): PenaltySide {
  return SIDES[randomBytes(4).readUInt32BE(0) % 3]!;
}

/** * Penalty Series: * - exactly 5 consecutive goals are required for a payout; * - the first miss ends the attempt immediately; * - there is no partial payout; * - stake is settled once for the complete attempt by the existing * casino play route. */
export function resolvePenaltySeriesRound(opts: { stake: number; shots: PenaltySide[]; }) {
  const { stake, shots } = opts;

  const keepers: PenaltySide[] = [];
  const results: boolean[] = [];
  let goals = 0;

  for (let i = 0; i < PENALTY_SERIES_SHOTS; i++) {
    const keeper = randSide();
    const scored = shots[i] !== keeper;

    keepers.push(keeper);
    results.push(scored);

    if (!scored) break;
    goals += 1;
  }

  const completed = goals === PENALTY_SERIES_SHOTS;
  const multiplier = completed ? PENALTY_SERIES_MULT[PENALTY_SERIES_SHOTS] ?? 0 : 0;
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

export function validatePenaltySeriesInput(raw: { stake?: unknown; shots?: unknown; }) {
  const stake = Number(raw.stake);

  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }

  if (!Array.isArray(raw.shots) || raw.shots.length !== PENALTY_SERIES_SHOTS) {
    return {
      ok: false as const,
      error: `Provide exactly ${PENALTY_SERIES_SHOTS} shots`,
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
