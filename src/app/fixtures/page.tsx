"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { MINIMUM_STAKE } from "@/types/domain";
import type { Match, Team, Competition, Market, Selection } from "@/types/domain";

type PickedSelection = { matchId: string; marketId: string; selection: Selection };

const STATUS_LABEL: Partial<Record<Match["status"], string>> = {
  open: "OPEN",
  locked: "LOCKED",
  live: "LIVE",
  finished: "FT",
  result_confirmed: "FT",
  settled: "FT",
  scheduled: "SOON",
};

export default function FixturesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});
  const [marketsByMatch, setMarketsByMatch] = useState<Record<string, Market>>({});

  const [picked, setPicked] = useState<PickedSelection | null>(null);
  const [stake, setStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

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

  function togglePick(matchId: string, marketId: string, selection: Selection) {
    setFeedback(null);
    setPicked((prev) =>
      prev?.selection.id === selection.id && prev.matchId === matchId ? null : { matchId, marketId, selection }
    );
    setStake("");
  }

  async function confirmBet() {
    if (!picked || !user) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: picked.matchId,
          marketId: picked.marketId,
          selectionId: picked.selection.id,
          stake: Number(stake),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not place bet");
      setFeedback(`Bet placed! Potential payout: ₦${body.potentialPayout.toLocaleString("en-NG")}`);
      setPicked(null);
      setStake("");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    const key = match.competitionId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(match);
  }

  const stakeNumber = Number(stake);
  const stakeValid = stake !== "" && stakeNumber >= MINIMUM_STAKE;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-6 pb-28">
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
            <div className="flex flex-col gap-2">
              {competitionMatches.map((match) => {
                const home = teams[match.homeTeamId];
                const away = teams[match.awayTeamId];
                const market = marketsByMatch[match.id];
                const canBet = match.status === "open" && market;
                const isSettled = match.status === "settled" && match.homeScore !== null;

                return (
                  <div key={match.id} className="rounded-xl bg-surface p-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs text-ink-muted">
                            {new Date(match.kickoffAt).toLocaleString("en-NG", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              match.status === "live"
                                ? "bg-loss/15 text-loss"
                                : match.status === "open"
                                  ? "bg-win/15 text-win"
                                  : "bg-ink-muted/15 text-ink-muted"
                            }`}
                          >
                            {STATUS_LABEL[match.status] ?? match.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm font-medium leading-snug">
  <p className="line-clamp-2">{home?.name ?? "Unknown team"}</p>
  <p className="line-clamp-2">{away?.name ?? "Unknown team"}</p>
</div>
                      </div>

                      {isSettled ? (
                        <span className="shrink-0 rounded-lg bg-bg px-3 py-1.5 text-sm font-semibold">
                          {match.homeScore} - {match.awayScore}
                        </span>
                      ) : market ? (
                        <div className="flex shrink-0 gap-1.5">
                          {market.selections.map((selection) => {
                            const isPicked =
                              picked?.matchId === match.id && picked.selection.id === selection.id;
                            return (
                              <button
                                key={selection.id}
                                disabled={!canBet}
                                onClick={() => togglePick(match.id, market.id, selection)}
                                className={`flex w-14 flex-col items-center rounded-lg px-1 py-1.5 transition-colors disabled:opacity-40 ${
                                  isPicked ? "bg-brand text-white" : "bg-brand/10 text-brand"
                                }`}
                              >
                                <span
                                  className={`text-[10px] ${isPicked ? "text-white/80" : "text-ink-muted"}`}
                                >
                                  {selection.label}
                                </span>
                                <span className="text-sm font-semibold">
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

                    {picked?.matchId === match.id && (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg bg-bg p-3">
                        {!user ? (
                          <p className="text-sm text-ink-muted">
                            <Link href="/login" className="text-brand underline">Log in</Link> to place a bet.
                          </p>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={MINIMUM_STAKE}
                                placeholder={`Stake (min ₦${MINIMUM_STAKE.toLocaleString("en-NG")})`}
                                value={stake}
                                onChange={(e) => setStake(e.target.value)}
                                className="flex-1 rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-sm text-ink"
                              />
                              <button
                                onClick={confirmBet}
                                disabled={!stakeValid || submitting}
                                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                              >
                                {submitting ? "Placing…" : "Place bet"}
                              </button>
                            </div>
                            {stakeValid && (
                              <p className="text-xs text-ink-muted">
                                Potential payout: ₦
                                {Math.round(stakeNumber * picked.selection.odds).toLocaleString("en-NG")}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {feedback && (
        <div className="fixed inset-x-4 bottom-20 mx-auto max-w-md rounded-lg bg-surface p-3 text-center text-sm shadow-lg">
          {feedback}
        </div>
      )}
    </main>
  );
                              }
