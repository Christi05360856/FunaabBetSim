import { NextResponse, type NextRequest } from "next/server";
import {
  dayCommitment,
  daySeed,
  lagosDayKey,
  sha256Hex,
} from "@/lib/fair/commit";
import { phaseAt } from "@/lib/virtual/schedule";

export const dynamic = "force-dynamic";

/**
 * Provably fair:
 * - During the day: only commitment (hash) is public.
 * - After Lagos midnight + 1h grace, previous day's seed is revealed.
 */
export async function GET(_request: NextRequest) {
  const now = Date.now();
  const today = lagosDayKey(now);
  const phase = phaseAt(now);

  // Previous day key
  const yestMs = now - 24 * 60 * 60 * 1000;
  const yesterday = lagosDayKey(yestMs);

  const payload: Record<string, unknown> = {
    ok: true,
    today,
    todayCommitment: dayCommitment(today),
    currentRoundIndex: phase.index,
    note: "Results for each round are derived as sha256(daySeed + ':round:' + index). Anyone can recompute after the seed is revealed.",
  };

  // Reveal yesterday's seed (always safe — day is over)
  payload.yesterday = yesterday;
  payload.yesterdayCommitment = dayCommitment(yesterday);
  payload.yesterdaySeed = daySeed(yesterday);
  payload.yesterdaySeedCheck = sha256Hex(daySeed(yesterday));

  return NextResponse.json(payload);
}
