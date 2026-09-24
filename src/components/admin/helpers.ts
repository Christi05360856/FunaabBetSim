import { useEffect, useState } from "react";
import type { Competition, Match, MatchStatus, Team } from "@/types/domain";

// ---- Fixture grouping & ordering --------------------------------------------
// Admin order: in-play → upcoming (soonest first) → kickoff passed but not
// finished (needs attention) → finished (most recent first).

export type FixtureGroup = "live" | "upcoming" | "pending" | "final";

export const GROUP_ORDER: FixtureGroup[] = ["live", "upcoming", "pending", "final"];

export const GROUP_LABEL: Record<FixtureGroup, string> = {
  live: "Live now",
  upcoming: "Upcoming",
  pending: "Kickoff passed — needs attention",
  final: "Finished",
};

const FINAL_STATUSES: MatchStatus[] = ["settled", "voided"];
const IN_PLAY_STATUSES: MatchStatus[] = ["live", "halftime", "second_half"];

export function isFinal(m: Pick<Match, "status">): boolean {
  return FINAL_STATUSES.includes(m.status);
}

export function isInPlay(m: Pick<Match, "status">): boolean {
  return IN_PLAY_STATUSES.includes(m.status);
}

export function fixtureGroup(m: Match, now: number): FixtureGroup {
  if (isInPlay(m)) return "live";
  if (isFinal(m)) return "final";
  return m.kickoffAt >= now ? "upcoming" : "pending";
}

export function sortFixtures(list: Match[], now: number = Date.now()): Match[] {
  const rank = (m: Match) => GROUP_ORDER.indexOf(fixtureGroup(m, now));
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const soonestFirst = ra <= 1; // live + upcoming
    return soonestFirst ? a.kickoffAt - b.kickoffAt : b.kickoffAt - a.kickoffAt;
  });
}

// Re-renders every minute so "Upcoming" vs "Kickoff passed" stays accurate.
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---- Display helpers (always FULL names — short codes are not shown) ----------

export function teamName(id: string, teamsById: Record<string, Team>): string {
  return teamsById[id]?.name ?? "Unknown team";
}

export function competitionName(id: string, competitionsById: Record<string, Competition>): string {
  return competitionsById[id]?.name ?? "Unknown competition";
}

export function formatKickoff(ts: number): string {
  return new Date(ts).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hasScore(m: Match): boolean {
  return typeof m.homeScore === "number" && typeof m.awayScore === "number";
}

