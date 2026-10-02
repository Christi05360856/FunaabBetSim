"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Match, Team, Competition } from "@/types/domain";
import { groupFixturesForBrowsing } from "@/lib/domain/fixtureDisplay";
import { LiveClockBadge } from "@/components/LiveClock";

export default function HomePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});
  const [now, setNow] = useState(() => Date.now());

  // One cached API call instead of three live Firestore listeners.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/public/fixtures");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          matches: Match[];
          teams: Team[];
          competitions: Competition[];
        };
        if (cancelled) return;

        setMatches(
          data.matches.filter((m) => m?.id && m?.homeTeamId && m?.awayTeamId)
        );

        const teamMap: Record<string, Team> = {};
        data.teams.forEach((t) => {
          if (t?.id) teamMap[t.id] = t;
        });
        setTeams(teamMap);

        const compMap: Record<string, Competition> = {};
        data.competitions.forEach((c) => {
          if (c?.id) compMap[c.id] = c;
        });
        setCompetitions(compMap);
      } catch {
        /* keep showing the last data we had */
      }
    }

    load();
    const id = setInterval(load, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { live, upcoming } = groupFixturesForBrowsing(matches, now);
  const displayMatches = [...live, ...upcoming.flatMap((s) => s.matches)].slice(0, 10);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-28 pt-6">
      {/* Hero */}
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <h1 className="font-display text-3xl font-bold text-brand">FUNAAB BetSim</h1>
        <p className="text-sm text-ink-muted">Simulated sports betting. No real money.</p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/fixtures"
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-card"
          >
            Browse Fixtures
          </Link>
          <Link
            href="/bets"
            className="rounded-xl bg-surface px-6 py-3 text-sm font-semibold text-brand shadow-card"
          >
            My Bets
          </Link>
        </div>
      </div>

      {/* Live / Upcoming preview */}
      {displayMatches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            {live.length > 0 ? "Live & Upcoming" : "Upcoming Fixtures"}
          </h2>
          <div className="flex flex-col gap-2.5">
            {displayMatches.map((m) => (
              <Link
                key={m.id}
                href={`/fixtures/${m.id}`}
                className="flex items-center justify-between rounded-2xl bg-surface p-3.5 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    {m.competitionId ? competitions[m.competitionId]?.name ?? "…" : "…"}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {teams[m.homeTeamId]?.name ?? "Home"}
                  </p>
                  <p className="truncate text-sm font-semibold">
                    {teams[m.awayTeamId]?.name ?? "Away"}
                  </p>
                </div>
                <div className="shrink-0">
                  <LiveClockBadge match={m} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {displayMatches.length === 0 && (
        <p className="text-center text-sm text-ink-muted py-8">
          No fixtures right now — check back soon.
        </p>
      )}
    </main>
  );
    }
