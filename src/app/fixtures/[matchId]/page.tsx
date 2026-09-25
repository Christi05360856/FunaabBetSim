"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition, Market } from "@/types/domain";
import { isBettingOpen } from "@/lib/domain/matchClock";
import { groupFixturesForBrowsing } from "@/lib/domain/fixtureDisplay";
import { LiveClockBadge } from "@/components/LiveClock";
import { BetPanel } from "@/components/BetPanel";
import { usePlaceBet } from "@/lib/hooks/usePlaceBet";

export default function FixturesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});
  const [marketsByMatch, setMarketsByMatch] = useState<Record<string, Market>>({});
  const bet = usePlaceBet();

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

  // Re-groups every minute so a fixture slides from "Live" to date-grouped
  // sections, or between date buckets, without a page refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { live, upcoming, recentResults } = useMemo(() => groupFixturesForBrowsing(matches, now), [matches, now]);
  const isEmpty = live.length === 0 && upcoming.length === 0;

  function MatchCard({ match }: { match: Match }) {
    const home = teams[match.homeTeamId];
    const away = teams[match.awayTeamId];
    const market = marketsByMatch[match.id];
    const canBet = isBettingOpen(match) && Boolean(market);
    const isLive = match.status === "live" || match.status === "halftime" || match.status === "second_half";

    return (
      <div className={`rounded-2xl bg-surface p-3.5 shadow-card ${isLive ? "ring-1 ring-loss/25" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {competitions[match.competitionId]?.name ?? "…"}
          </p>
          <LiveClockBadge match={match} />
        </div>

        <div className="mt-2 flex items-center gap-3">
          <Link href={`/fixtures/${match.id}`} className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug">{home?.name ?? "Unknown team"}</p>
            <p className="truncate text-[15px] font-semibold leading-snug">{away?.name ?? "Unknown team"}</p>
          </Link>

          {match.status === "settled" && match.homeScore !== null ? (
            <span className="shrink-0 rounded-lg bg-surface-raised px-3 py-1.5 font-display text-base font-bold tabular-nums">
              {match.homeScore} – {match.awayScore}
            </span>
          ) : market ? (
            <div className="flex shrink-0 gap-1.5">
              {market.selections.map((selection) => {
                const isPicked = bet.picked?.matchId === match.id && bet.picked.selection.id === selection.id;
                return (
                  <button
                    key={selection.id}
                    disabled={!canBet}
                    onClick={() => bet.pick(match.id, market.id, selection)}
                    className={`flex w-[3.75rem] flex-col items-center rounded-xl px-1 py-2 transition-colors ${
                      !canBet
                        ? "bg-ink-muted/10 text-ink-muted"
                        : isPicked
                          ? "bg-brand text-white"
                          : "bg-brand/10 text-brand active:bg-brand/20"
                    }`}
                  >
                    <span className={`text-[10px] font-medium ${isPicked ? "text-white/80" : "text-ink-muted"}`}>
                      {selection.label}
                    </span>
                    <span className="flex items-center gap-0.5 font-display text-sm font-bold tabular-nums">
                      {!canBet && <LockIcon />}
                      {selection.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="shrink-0 text-xs text-ink-muted">Odds soon</span>
          )}
        </div>

        {bet.picked?.matchId === match.id && (
          <div className="mt-3">
            <BetPanel
              picked={bet.picked}
              homeLabel={home?.name ?? "Home"}
              awayLabel={away?.name ?? "Away"}
              user={bet.user}
              stake={bet.stake}
              setStake={bet.setStake}
              submitting={bet.submitting}
              onConfirm={bet.confirmBet}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pt-5 pb-28">
      <h1 className="font-display text-xl font-bold">Fixtures</h1>

      {isEmpty && (
        <p className="text-sm text-ink-muted">No fixtures right now — check back soon.</p>
      )}

      {live.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-loss">Live now</h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {live.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {upcoming.map((section) => (
        <section key={section.key} className="flex flex-col gap-2">
          <h2 className="px-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">{section.label}</h2>
          <div className="flex flex-col gap-2.5">
            {section.matches.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      ))}

      {recentResults.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">Recent results</h2>
          <div className="flex flex-col gap-2.5">
            {recentResults.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {bet.feedback && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md animate-fade-in rounded-xl bg-ink px-4 py-3 text-center text-sm text-bg shadow-card">
          {bet.feedback}
        </div>
      )}
    </main>
  );
}

function LockIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
      <path d="M17 9V7a5 5 0 00-10 0v2a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-8-2a3 3 0 016 0v2H9V7z" />
    </svg>
  );
}
