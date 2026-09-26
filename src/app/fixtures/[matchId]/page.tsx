"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition, Market } from "@/types/domain";
import { deriveClockState, isBettingOpen } from "@/lib/domain/matchClock";
import { BetPanel } from "@/components/BetPanel";
import { usePlaceBet } from "@/lib/hooks/usePlaceBet";

type MarketTab = "match_winner" | "over_under" | "double_chance" | "draw_no_bet";

const MARKET_TABS: { key: MarketTab; label: string }[] = [
  { key: "match_winner", label: "1X2" },
  { key: "over_under", label: "O/U" },
  { key: "double_chance", label: "DC" },
  { key: "draw_no_bet", label: "DNB" },
];

export default function MatchDetailPage({ params }: { params: { matchId: string } }) {
  const { matchId } = params;
  const router = useRouter();

  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [home, setHome] = useState<Team | null>(null);
  const [away, setAway] = useState<Team | null>(null);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeTab, setActiveTab] = useState<MarketTab>("match_winner");
  const bet = usePlaceBet();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matches", matchId), (snap) => {
      setMatch(snap.exists() ? (snap.data() as Match) : null);
    });
    return () => unsub();
  }, [matchId]);

  useEffect(() => {
    if (!match || !match.homeTeamId || !match.awayTeamId || !match.competitionId) return;
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
    const unsub = onSnapshot(
      query(collection(db, "markets"), where("matchId", "==", match.id)),
      (snap) => setMarkets(snap.docs.map((d) => d.data() as Market))
    );
    return () => unsub();
  }, [match]);

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

  if (match === null || !match.homeTeamId || !match.awayTeamId || !match.competitionId || !match.kickoffAt) {
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
  
  const activeMarket = markets.find((m) => m.type === activeTab);

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

      {/* Market Tabs */}
      <div className="flex border-b border-ink-muted/10 bg-surface">
        {MARKET_TABS.map((tab) => {
          const hasMarket = markets.some((m) => m.type === tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "text-brand border-b-2 border-brand"
                  : "text-ink-muted"
              } ${!hasMarket ? "opacity-50" : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Market Content */}
      <div className="flex flex-col gap-3 px-4 pt-4">
        {!activeMarket ? (
          <div className="rounded-2xl bg-surface p-4 text-center text-sm text-ink-muted shadow-card">
            Odds haven&apos;t been set for this market yet.
          </div>
        ) : (
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            {/* Market header with line for O/U */}
            {activeMarket.type === "over_under" && (
              <p className="mb-3 text-center text-xs font-medium text-ink-muted">
                Total Goals Line: {(activeMarket as any).line ?? 2.5}
              </p>
            )}
            
            <div className="flex gap-2">
              {activeMarket.selections.map((selection) => {
                const isPicked = bet.picked?.selection.id === selection.id;
                return (
                  <button
                    key={selection.id}
                    disabled={!canBet}
                    onClick={() => bet.pick(match.id, activeMarket.id, selection)}
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
