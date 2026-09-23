"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition, Market } from "@/types/domain";

export default function FixturesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});
  const [marketsByMatch, setMarketsByMatch] = useState<Record<string, Market>>({});

  useEffect(() => {
    const unsubMatches = onSnapshot(
      query(collection(db, "matches"), orderBy("kickoffAt")),
      (snap) => setMatches(snap.docs.map((d) => d.data() as Match))
    );
    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const map: Record<string, Team> = {};
      snap.docs.forEach((d) => {
        const team = d.data() as Team;
        map[team.id] = team;
      });
      setTeams(map);
    });
    const unsubCompetitions = onSnapshot(collection(db, "competitions"), (snap) => {
      const map: Record<string, Competition> = {};
      snap.docs.forEach((d) => {
        const competition = d.data() as Competition;
        map[competition.id] = competition;
      });
      setCompetitions(map);
    });
    const unsubMarkets = onSnapshot(
      query(collection(db, "markets"), where("type", "==", "match_winner")),
      (snap) => {
        const map: Record<string, Market> = {};
        snap.docs.forEach((d) => {
          const market = d.data() as Market;
          map[market.matchId] = market;
        });
        setMarketsByMatch(map);
      }
    );
    return () => {
      unsubMatches();
      unsubTeams();
      unsubCompetitions();
      unsubMarkets();
    };
  }, []);

  // Group matches under their competition, in kickoff order, so the page
  // reads like a real fixture list — league header, then its matches.
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    const key = match.competitionId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(match);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <h1 className="mb-4 font-display text-xl font-semibold">Fixtures</h1>

      {matches.length === 0 && (
        <p className="text-ink-muted">No fixtures yet — check back soon.</p>
      )}

      <div className="flex flex-col gap-5">
        {Array.from(groups.entries()).map(([competitionId, competitionMatches]) => (
          <section key={competitionId}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {competitions[competitionId]?.name ?? "…"}
            </h2>
            <div className="flex flex-col divide-y divide-ink-muted/20 rounded-xl bg-surface">
              {competitionMatches.map((match) => {
                const home = teams[match.homeTeamId];
                const away = teams[match.awayTeamId];
                const market = marketsByMatch[match.id];

                return (
                  <div key={match.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-ink-muted">
                        {new Date(match.kickoffAt).toLocaleString("en-NG", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="truncate text-sm font-medium">
                        {home?.shortName ?? "?"} <span className="text-ink-muted">v</span>{" "}
                        {away?.shortName ?? "?"}
                      </p>
                    </div>

                    {market ? (
                      <div className="flex shrink-0 gap-1.5">
                        {market.selections.map((selection) => (
                          <div
                            key={selection.id}
                            className="flex w-14 flex-col items-center rounded-lg bg-brand/10 px-1 py-1.5"
                          >
                            <span className="text-[10px] text-ink-muted">{selection.label}</span>
                            <span className="text-sm font-semibold text-brand">
                              {selection.odds.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-muted">Odds soon</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
