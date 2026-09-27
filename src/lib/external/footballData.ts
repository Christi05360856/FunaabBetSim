/**
 * football-data.org v4 client (server-only).
 * Free tier: \~10 req/min — cache in Firestore, never call from the browser.
 */

export type FdMatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "EXTRA_TIME"
  | "PENALTY_SHOOTOUT"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export type FdMatch = {
  id: number;
  utcDate: string;
  status: FdMatchStatus;
  matchday: number | null;
  homeTeam: { id: number; name: string; shortName: string; tla: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string; crest: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  competition: { id: number; name: string; code: string };
};

const BASE = "https://api.football-data.org/v4";

function token(): string {
  const t = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!t) throw new Error("FOOTBALL_DATA_API_TOKEN is not set");
  return t;
}

export async function fdFetch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "X-Auth-Token": token() },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("football-data " + res.status + ": " + body.slice(0, 200));
  }
  return res.json() as Promise<T>;
}

/** Upcoming + timed matches in a date window. */
export async function fetchCompetitionMatches(
  code: "PL" | "PD",
  dateFrom: string,
  dateTo: string,
  status?: string
): Promise<FdMatch[]> {
  const q = new URLSearchParams({ dateFrom, dateTo });
  if (status) q.set("status", status);
  const data = await fdFetch<{ matches: FdMatch[] }>(
    "/competitions/" + code + "/matches?" + q.toString()
  );
  return data.matches ?? [];
}

export function mapFdStatusToOurs(
  status: FdMatchStatus
): import("@/types/domain").MatchStatus {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    case "IN_PLAY":
    case "EXTRA_TIME":
    case "PENALTY_SHOOTOUT":
      return "live";
    case "PAUSED":
      return "halftime";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
    case "SUSPENDED":
      return "voided";
    default:
      return "scheduled";
  }
}

export function teamDocId(providerTeamId: number): string {
  return "fd-" + providerTeamId;
}

export function matchDocId(providerMatchId: number): string {
  return "fd-" + providerMatchId;
}

export function competitionDocId(code: "PL" | "PD"): string {
  return code === "PL" ? "epl" : "laliga";
}
