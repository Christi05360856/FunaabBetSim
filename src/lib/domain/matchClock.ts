/**
 * Derives the live match clock from kickoffAt alone — never a stored,
 * incrementing minute counter (spec §5). Pure function: same inputs always
 * give the same output, so every viewer sees identical state, it survives
 * refresh/restart, and it's trivial to unit test.
 *
 * FRO (Final Result Only): this module never reveals a live score. It only
 * ever answers "what phase is the match in, and what should the clock read".
 * The actual score stays hidden until the admin confirms it at full time.
 */
import {
  FIRST_HALF_MINUTES,
  HALFTIME_MINUTES,
  SECOND_HALF_MINUTES,
  FIRST_HALF_ADDED_TIME,
  SECOND_HALF_ADDED_TIME,
  type Match,
} from "@/types/domain";

export type ClockPhase = "upcoming" | "first_half" | "halftime" | "second_half" | "full_time" | "final";

export interface ClockState {
  phase: ClockPhase;
  /** Human-readable clock text: "KICK-OFF 14:00", "63'", "45+2'", "HT", "FT". */
  display: string;
  /** True only during first_half / second_half — used to render the pulsing LIVE dot. */
  isLive: boolean;
}

const MIN_MS = 60_000;
const FIRST_HALF_SPAN = (FIRST_HALF_MINUTES + FIRST_HALF_ADDED_TIME) * MIN_MS; // 47'
const HALFTIME_SPAN = HALFTIME_MINUTES * MIN_MS; // 15'
const SECOND_HALF_SPAN = (SECOND_HALF_MINUTES + SECOND_HALF_ADDED_TIME) * MIN_MS; // 47'

const HALFTIME_START = FIRST_HALF_SPAN;
const SECOND_HALF_START = HALFTIME_START + HALFTIME_SPAN;
const FULL_TIME_START = SECOND_HALF_START + SECOND_HALF_SPAN;

function formatKickoff(kickoffAt: number): string {
  return new Date(kickoffAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

// Renders "63'" normally, or "45+2'" once a half runs into its added time.
function minuteLabel(elapsedInHalfMs: number, regulationMinutes: number): string {
  const minute = Math.floor(elapsedInHalfMs / MIN_MS) + 1; // kickoff instant reads as 1', not 0'
  if (minute <= regulationMinutes) return `${minute}'`;
  return `${regulationMinutes}+${minute - regulationMinutes}'`;
}

/**
 * `match.status` is still the admin-authoritative switch for whether a match
 * is finalized (settled/voided/postponed) — those override the derived clock
 * outright, since no amount of elapsed time can undo an admin action.
 * Everything else (live / halftime / full-time-awaiting-result) is computed
 * purely from time, so it needs no cron job and no write to Firestore.
 */
export function deriveClockState(match: Pick<Match, "status" | "kickoffAt">, now: number = Date.now()): ClockState {
  if (match.status === "settled" || match.status === "voided" || match.status === "postponed") {
    return { phase: "final", display: match.status === "postponed" ? "POSTPONED" : "FT", isLive: false };
  }

  const elapsed = now - match.kickoffAt;

  if (elapsed < 0) {
    return { phase: "upcoming", display: `KICK-OFF ${formatKickoff(match.kickoffAt)}`, isLive: false };
  }
  if (elapsed < FIRST_HALF_SPAN) {
    return { phase: "first_half", display: minuteLabel(elapsed, FIRST_HALF_MINUTES), isLive: true };
  }
  if (elapsed < SECOND_HALF_START) {
    return { phase: "halftime", display: "HT", isLive: false };
  }
  if (elapsed < FULL_TIME_START) {
    const elapsedInSecondHalf = elapsed - SECOND_HALF_START;
    const minute = Math.floor(elapsedInSecondHalf / MIN_MS) + 1 + FIRST_HALF_MINUTES;
    return {
      phase: "second_half",
      display: minute <= FIRST_HALF_MINUTES + SECOND_HALF_MINUTES ? `${minute}'` : `${FIRST_HALF_MINUTES + SECOND_HALF_MINUTES}+${minute - (FIRST_HALF_MINUTES + SECOND_HALF_MINUTES)}'`,
      isLive: true,
    };
  }
  // Kickoff time has fully elapsed but the admin hasn't confirmed a result
  // yet — still "full_time", just waiting on the admin (spec §9).
  return { phase: "full_time", display: "FT", isLive: false };
}

/** A match only accepts new bets while explicitly opened AND before kickoff (spec §4). */
export function isBettingOpen(match: Pick<Match, "status" | "kickoffAt">, now: number = Date.now()): boolean {
  return match.status === "open" && now < match.kickoffAt;
}
