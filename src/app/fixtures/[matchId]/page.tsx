"use client";

/**
 * Match detail page. Right now it only ever has one market (Match Winner —
 * the only implemented MarketType), so the "Markets" section is a single
 * card. It exists as its own route/layout so future market types
 * (Double Chance, Over/Under, BTTS…) have a real home to render into later,
 * without another redesign — see MarketType in types/domain.ts.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition, Market } from "@/types/domain";
import { deriveClockState, isBettingOpen } from "@/lib/domain/matchClock";
import { BetPanel } from "@/components/BetPanel";
import { usePlaceBet } from "@/lib/hooks/usePlaceBet";

// Next.js 14 App Router passes params synchronously as a plain object here
// (the params-as-Promise + React use() pattern is a Next.js 15 convention —
// this project is pinned to 14.2.15, see the handover doc).
export default function MatchDetailPage({ params }: { params: { matchId: string } }) {
  const { matchId } = params;
  const router = useRouter();

  const [match, setMatch] = useState<Match | null | undefined>(undefined); // undefined = loading
  const [home, setHome] = useState<Team | null>(null);
  const [away, setAway] = useState<Team | null>(null);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const bet = usePlaceBet();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matches", matchId), (snap) => {
      setMatch(snap.exists() ? (snap.data() as Match) : null);
    });
    return () => unsub();
  }, [matchId]);

  useEffect(() => {
    if (!match) return;
    const unsubHome = onSnapshot(doc(db, "teams", match.homeTeamId), (s) => setHome(s.exists() ? (s.data() as Team) : null));
    const unsubAway = onSnapshot(doc(db, "teams", match.awayTeamId), (s) => setAway(s.exists() ? (s.data() as Team) : null));
    const unsubComp = onSnapshot(doc(db, "competitions", match.competitionId), (s) => setCompetition(s.exists() ? (s.data() as Competition) : null));
    return () => {
      unsubHome();
      unsubAway();
      unsubComp();
    };
  }, [match]);

  useEffect(() => {
    if (!match) return;
    // Market doc IDs are auto-generated (adminDb.collection("markets").doc()),
    // not derived from the match — so this queries by matchId+type, the same
    // pattern the settle/void API routes already use server-side.
    const unsub = onSnapshot(
      query(collection(db, "markets"), where("matchId", "==", match.id), where("type", "==", "match_winner")),
      (snap) => setMarket(snap.empty ? null : (snap.docs[0]!.data() as Market))
    );
    return () => unsub();
  }, [match]);

  // Live clock ticks itself every 15s so this page updates through kickoff/HT/FT.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (match === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </main>
    );
  }

  if (match === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-medium">Fixture not found</p>
        <button onClick={() => router.push("/fixtures")} className="text-sm font-medium text-brand underline">
          Back to Fixtures
        </button>
      </main>
    );
  }

  const clock = deriveClockState(match, now);
  const canBet = isBettingOpen(match, now);
  const isLive = clock.phase === "first_half" || clock.phase === "second_half";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col pb-28">
      {/* Hero */}
      <div className="bg-gradient-to-b from-brand to-brand-dark px-4 pb-6 pt-4 text-white">
        <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-white/80">
          <BackIcon /> Back
        </button>
        <p className="text-center text-xs font-medium uppercase tracking-wide text-white/70">
          {competition?.name ?? "…"}
        </p>
        <div className="mt-3 flex items-center justify-center gap-4">
          <p className="flex-1 text-right text-base font-semibold leading-tight">{home?.name ?? "Home"}</p>
          <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
            {clock.display}
          </span>
          <p className="flex-1 text-left text-base font-semibold leading-tight">{away?.name ?? "Away"}</p>
        </div>
        {isLive && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-white/80">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live now
          </p>
        )}
        {match.status === "settled" && match.homeScore !== null && (
          <p className="mt-2 text-center font-display text-2xl font-bold">
            {match.homeScore} – {match.awayScore}
          </p>
        )}
      </div>

      {/* Markets */}
      <div className="flex flex-col gap-3 px-4 pt-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Match Winner</h2>

        {!market ? (
          <div className="rounded-2xl bg-surface p-4 text-center text-sm text-ink-muted shadow-card">
            Odds haven&apos;t been set for this match yet.
          </div>
        ) : (
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="flex gap-2">
              {market.selections.map((selection) => {
                const isPicked = bet.picked?.selection.id === selection.id;
                return (
                  <button
                    key={selection.id}
                    disabled={!canBet}
                    onClick={() => bet.pick(match.id, market.id, selection)}
                    className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-3 transition-colors ${
                      !canBet
                        ? "bg-ink-muted/10 text-ink-muted"
                        : isPicked
                          ? "bg-brand text-white"
                          : "bg-brand/10 text-brand active:bg-brand/20"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isPicked ? "text-white/80" : "text-ink-muted"}`}>
                      {selection.label}
                    </span>
                    <span className="flex items-center gap-1 font-display text-lg font-bold tabular-nums">
                      {!canBet && <LockIcon />}
                      {selection.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
            {!canBet && (
              <p className="mt-2.5 text-center text-xs text-ink-muted">
                {match.status === "settled" ? "This match has been settled." : "Betting is closed for this match."}
              </p>
            )}
          </div>
        )}

        {bet.picked && (
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
        )}
      </div>

      {/* Room for future market types (Double Chance, Over/Under, BTTS…) once
          their admin UI + settlement resolvers exist — see handover §12. */}

      {bet.feedback && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md animate-fade-in rounded-xl bg-ink px-4 py-3 text-center text-sm text-bg shadow-card">
          {bet.feedback}
        </div>
      )}
    </main>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="opacity-70">
      <path d="M17 9V7a5 5 0 00-10 0v2a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-8-2a3 3 0 016 0v2H9V7z" />
    </svg>
  );
}
