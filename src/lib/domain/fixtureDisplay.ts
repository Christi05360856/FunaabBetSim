/**
 * Pure display helpers for the user-facing fixtures list — date bucketing
 * and grouping only. No Firestore, no React; same "pure function, easy to
 * test" pattern as matchClock.ts.
 */
import type { Match, MatchStatus } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

// Small, deliberately duplicated here rather than imported from the admin
// helpers — this file is bundled into the public site, and the admin
// helpers module lives under components/admin/ for a reason (kept out of
// the public bundle's import graph).
const FINAL_STATUSES: MatchStatus[] = ["settled", "voided"];
const IN_PLAY_STATUSES: MatchStatus[] = ["live", "halftime", "second_half"];
function isFinal(m: Pick<Match, "status">): boolean {
  return FINAL_STATUSES.includes(m.status);
}
function isInPlay(m: Pick<Match, "status">): boolean {
  return IN_PLAY_STATUSES.includes(m.status);
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Tomorrow", or e.g. "Sat, 27 Sep" — whichever reads fastest. */
export function dateBucketLabel(kickoffAt: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(kickoffAt) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Date(kickoffAt).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

export interface FixtureSection {
  key: string;
  label: string;
  matches: Match[];
}

/**
 * Splits matches into: live-now (own section, always first), then upcoming
 * grouped by date bucket (chronological), with finished/voided matches left
 * out entirely — they stay in Bet History, this is the active sportsbook.
 */
export function groupFixturesForBrowsing(matches: Match[], now: number = Date.now()): {
  live: Match[];
  upcoming: FixtureSection[];
  recentResults: Match[];
} {
  const live = matches.filter((m) => isInPlay(m)).sort((a, b) => a.kickoffAt - b.kickoffAt);

  const upcomingMatches = matches
    .filter((m) => !isInPlay(m) && !isFinal(m))
    .sort((a, b) => a.kickoffAt - b.kickoffAt);

  const byBucket = new Map<string, Match[]>();
  for (const m of upcomingMatches) {
    const key = dateBucketLabel(m.kickoffAt, now);
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key)!.push(m);
  }
  const upcoming: FixtureSection[] = Array.from(byBucket.entries()).map(([key, ms]) => ({
    key,
    label: key,
    matches: ms,
  }));

  const recentResults = matches
    .filter((m) => m.status === "settled")
    .sort((a, b) => b.kickoffAt - a.kickoffAt)
    .slice(0, 5);

  return { live, upcoming, recentResults };
}
