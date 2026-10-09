/** Shared virtual football schedule — pure clock math, no DB/cron. */

export const VIRTUAL_ROUND_MS = 3 * 60 * 1000; // 3 minutes
/** Betting open for first 2.5 minutes of the round. */
export const VIRTUAL_BETTING_MS = 2 * 60 * 1000 + 30 * 1000;
/** Animation / result window after kickoff. */
export const VIRTUAL_PLAY_MS = VIRTUAL_ROUND_MS - VIRTUAL_BETTING_MS;
/** Season length for table (rolling). */
export const VIRTUAL_SEASON_ROUNDS = 20;

export type RoundPhase = "betting" | "live" | "result";

export function roundIndexAt(ms = Date.now()): number {
  return Math.floor(ms / VIRTUAL_ROUND_MS);
}

export function roundWindow(index: number) {
  const startsAt = index * VIRTUAL_ROUND_MS;
  const kickoffAt = startsAt + VIRTUAL_BETTING_MS;
  const endsAt = startsAt + VIRTUAL_ROUND_MS;
  return { startsAt, kickoffAt, endsAt };
}

export function phaseAt(ms = Date.now()): {
  index: number;
  phase: RoundPhase;
  startsAt: number;
  kickoffAt: number;
  endsAt: number;
  msToKickoff: number;
  msToEnd: number;
} {
  const index = roundIndexAt(ms);
  const { startsAt, kickoffAt, endsAt } = roundWindow(index);
  let phase: RoundPhase = "betting";
  if (ms >= endsAt) phase = "result";
  else if (ms >= kickoffAt) phase = "live";
  return {
    index,
    phase,
    startsAt,
    kickoffAt,
    endsAt,
    msToKickoff: Math.max(0, kickoffAt - ms),
    msToEnd: Math.max(0, endsAt - ms),
  };
}

export function roundId(index: number): string {
  return `VR-${index}`;
}
