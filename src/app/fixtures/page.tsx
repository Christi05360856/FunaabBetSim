"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition } from "@/types/domain";

export default function FixturesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});

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
    return () => {
      unsubMatches();
      unsubTeams();
      unsubCompetitions();
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">Fixtures</h1>

      {matches.length === 0 && (
        <p className="text-ink-muted">No fixtures yet — check back soon.</p>
      )}

      <ul className="flex flex-col gap-3">
        {matches.map((match) => {
          const home = teams[match.homeTeamId];
          const away = teams[match.awayTeamId];
          const competition = competitions[match.competitionId];

          return (
            <li key={match.id} className="rounded-xl bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                {competition?.name ?? "…"}
              </p>
              <p className="mt-1 font-medium">
                {home?.shortName ?? "…"} vs {away?.shortName ?? "…"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {new Date(match.kickoffAt).toLocaleString("en-NG", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                <span className="capitalize">{match.status.replace("_", " ")}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
