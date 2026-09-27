"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Bet, BetLeg, Match, Team } from "@/types/domain";
import {
  formatSelectionLabel,
  matchFinalScore,
} from "@/lib/domain/selectionLabel";

function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel || "",
      odds: bet.oddsAtPlacement || (bet.stake > 0 ? bet.potentialPayout / bet.stake : 1),
    },
  ];
}

function totalOdds(bet: Bet): number {
  const legs = betLegs(bet);
  if (legs.length === 0) return 1;
  return legs.reduce((acc, l) => acc * (l.odds || 1), 1);
}

export default function MyBetsPage() {
  const { user, loading } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [activeTab, setActiveTab] = useState<"open" | "settled">("open");
  const [activeMenuBetId, setActiveMenuBetId] = useState<string | null>(null);
  const [detailBet, setDetailBet] = useState<Bet | null>(null);
  const [sharingBet, setSharingBet] = useState<Bet | null>(null);
  const [printingBet, setPrintingBet] = useState<Bet | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubBets = onSnapshot(
      query(collection(db, "bets"), where("uid", "==", user.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Bet)
          .sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0));
        setBets(list);
      }
    );

    const unsubMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const map: Record<string, Match> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as Match;
      });
      setMatches(map);
    });

    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const map: Record<string, Team> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as Team;
      });
      setTeams(map);
    });

    return () => {
      unsubBets();
      unsubMatches();
      unsubTeams();
    };
  }, [user]);

  async function handleHideBet(betId: string) {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/bets/hide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + idToken,
        },
        body: JSON.stringify({ betId, hidden: true }),
      });
    } catch (e) {
      console.error(e);
    }
    setActiveMenuBetId(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
        <p className="font-semibold">Sign in to view your bets</p>
        <Link href="/login" className="text-brand underline">
          Go to Login
        </Link>
      </main>
    );
  }

  const visible = bets.filter((b) => !b.hidden);
  const openBets = visible.filter((b) => b.status === "open");
  const settledBets = visible.filter((b) => b.status !== "open");
  const list = activeTab === "open" ? openBets : settledBets;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <h1 className="font-display text-xl font-bold">My Bets</h1>

      <div className="mt-4 flex rounded-xl bg-surface p-1 shadow-card">
        <button
          type="button"
          onClick={() => setActiveTab("open")}
          className={
            "flex-1 rounded-lg py-2.5 text-sm font-semibold " +
            (activeTab === "open" ? "bg-brand text-white" : "text-ink-muted")
          }
        >
          Open ({openBets.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settled")}
          className={
            "flex-1 rounded-lg py-2.5 text-sm font-semibold " +
            (activeTab === "settled" ? "bg-brand text-white" : "text-ink-muted")
          }
        >
          Settled ({settledBets.length})
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {list.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-muted">
            No {activeTab} bets.
          </p>
        ) : (
          list.map((bet) => {
            const legs = betLegs(bet);
            const first = legs[0];
            const match = first ? matches[first.matchId] : matches[bet.matchId];
            const home = match ? teams[match.homeTeamId]?.name ?? "Home" : "Home";
            const away = match ? teams[match.awayTeamId]?.name ?? "Away" : "Away";
            const score = matchFinalScore(match);
            const odds = totalOdds(bet);
            const isAcca = legs.length > 1;
            const selText = formatSelectionLabel(
              first?.selectionId ?? bet.selectionId,
              first?.selectionLabel ?? bet.selectionLabel
            );

            return (
              <div
                key={bet.id}
                className="relative rounded-2xl bg-surface p-4 shadow-card"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setDetailBet(bet);
                    setActiveMenuBetId(null);
                  }}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-muted">
                      ID: {bet.id.slice(0, 8)}
                    </span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                        (bet.status === "won"
                          ? "bg-win/15 text-win"
                          : bet.status === "lost"
                            ? "bg-loss/15 text-loss"
                            : "bg-ink-muted/15 text-ink-muted")
                      }
                    >
                      {bet.status}
                    </span>
                  </div>

                  <p className="mt-2 text-sm font-semibold">
                    {isAcca
                      ? "Accumulator · " + legs.length + " legs"
                      : home + " vs " + away}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {isAcca ? legs.length + " selections" : "Selection: " + selText}
                  </p>
                  {score && !isAcca && (
                    <p className="mt-1 text-xs font-medium">
                      {score.live ? "Live " : "FT "}
                      <span className={score.live ? "text-loss" : ""}>
                        {score.text}
                      </span>
                    </p>
                  )}

                  <div className="mt-3 flex justify-between border-t border-ink-muted/10 pt-3 text-sm">
                    <div>
                      <p className="text-[10px] text-ink-muted">Odds</p>
                      <p className="font-semibold">{odds.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-muted">Stake</p>
                      <p className="font-semibold">
                        ₦{bet.stake.toLocaleString("en-NG")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-ink-muted">
                        {bet.status === "won" ? "Return" : "Pot. win"}
                      </p>
                      <p className="font-semibold text-win">
                        ₦{bet.potentialPayout.toLocaleString("en-NG")}
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="absolute right-3 top-3 rounded p-1 text-ink-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuBetId(
                      activeMenuBetId === bet.id ? null : bet.id
                    );
                  }}
                >
                  ⋮
                </button>

                {activeMenuBetId === bet.id && (
                  <div className="absolute right-3 top-10 z-20 w-36 rounded-lg bg-surface py-1 shadow-card ring-1 ring-ink-muted/15">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setDetailBet(bet);
                        setActiveMenuBetId(null);
                      }}
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setSharingBet(bet);
                        setActiveMenuBetId(null);
                      }}
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setPrintingBet(bet);
                        setActiveMenuBetId(null);
                        setTimeout(() => window.print(), 150);
                      }}
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-loss"
                      onClick={() => handleHideBet(bet.id)}
                    >
                      Hide
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {detailBet && (
        <TicketDetail
          bet={detailBet}
          matches={matches}
          teams={teams}
          onClose={() => setDetailBet(null)}
        />
      )}

      {sharingBet && (
        <ShareSheet
          bet={sharingBet}
          matches={matches}
          teams={teams}
          onClose={() => setSharingBet(null)}
        />
      )}

      {printingBet && (
        <div className="hidden print:block">
          <PrintTicket
            bet={printingBet}
            matches={matches}
            teams={teams}
          />
        </div>
      )}
    </main>
  );
}

function TicketDetail({
  bet,
  matches,
  teams,
  onClose,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
  onClose: () => void;
}) {
  const legs = betLegs(bet);
  const odds = totalOdds(bet);
  const isAcca = legs.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <button type="button" onClick={onClose} aria-label="Back">
          ←
        </button>
        <h2 className="flex-1 font-display text-lg font-bold">Ticket Details</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <div className="rounded-xl bg-surface p-4 shadow-card">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>ID: {bet.id.slice(0, 10).toUpperCase()}</span>
            <span>
              {new Date(bet.placedAt).toLocaleString("en-NG", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold">
            {isAcca ? "Accumulator" : "Single"}
          </p>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Status</span>
              <span className="font-bold uppercase">{bet.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Odds</span>
              <span className="font-semibold">{odds.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Stake</span>
              <span className="font-semibold">
                ₦{bet.stake.toLocaleString("en-NG")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">
                {bet.status === "won" ? "Return" : "Potential return"}
              </span>
              <span className="font-semibold text-win">
                ₦{bet.potentialPayout.toLocaleString("en-NG")}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {legs.map((leg, i) => {
            const match = matches[leg.matchId];
            const home = match
              ? teams[match.homeTeamId]?.name ?? "Home"
              : "Home";
            const away = match
              ? teams[match.awayTeamId]?.name ?? "Away"
              : "Away";
            const score = matchFinalScore(match);
            const sel = formatSelectionLabel(
              leg.selectionId,
              leg.selectionLabel
            );

            return (
              <div
                key={leg.matchId + "-" + leg.selectionId + "-" + i}
                className={
                  "rounded-xl bg-surface p-4 shadow-card " +
                  (bet.status === "won"
                    ? "ring-1 ring-win/30"
                    : bet.status === "lost"
                      ? "ring-1 ring-loss/20"
                      : "")
                }
              >
                <p className="text-xs text-ink-muted">
                  {match
                    ? new Date(match.kickoffAt).toLocaleString("en-NG", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {home} vs {away}
                </p>
                {score && (
                  <p className="mt-1 text-xs font-medium">
                    {score.live ? "Live " : "FT "}
                    <span className={score.live ? "text-loss" : "text-ink"}>
                      {score.text}
                    </span>
                  </p>
                )}
                <div
                  className={
                    "mt-3 rounded-lg px-3 py-2 text-sm " +
                    (bet.status === "won"
                      ? "bg-win/15"
                      : bet.status === "lost"
                        ? "bg-loss/10"
                        : "bg-surface-raised")
                  }
                >
                  <p>
                    <span className="text-ink-muted">Pick </span>
                    <span className="font-semibold">{sel}</span>
                    <span className="text-ink-muted"> @ </span>
                    <span className="font-semibold">{leg.odds.toFixed(2)}</span>
                    {bet.status === "won" && (
                      <span className="ml-1 text-win">✓</span>
                    )}
                    {bet.status === "lost" && (
                      <span className="ml-1 text-loss">✗</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {bet.status === "won" && (
          <div className="mt-4 rounded-xl bg-win/15 py-4 text-center">
            <p className="text-xs uppercase text-win">Paid out</p>
            <p className="font-display text-2xl font-bold text-win">
              +₦{bet.potentialPayout.toLocaleString("en-NG")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareSheet({
  bet,
  matches,
  teams,
  onClose,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
  onClose: () => void;
}) {
  const legs = betLegs(bet);
  const first = legs[0];
  const match = first ? matches[first.matchId] : undefined;
  const home = match ? teams[match.homeTeamId]?.name ?? "Home" : "Home";
  const away = match ? teams[match.awayTeamId]?.name ?? "Away" : "Away";
  const odds = totalOdds(bet);
  const sel = formatSelectionLabel(
    first?.selectionId,
    first?.selectionLabel ?? bet.selectionLabel
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#0b1c36] text-white shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-brand to-blue-900 px-4 py-4 text-center">
          <p className="font-display text-lg font-bold tracking-wide text-amber-300">
            FUNAAB BETSIM
          </p>
          <p className="mt-1 text-[11px] text-blue-200">
            Bet ID: {bet.id.slice(0, 12).toUpperCase()}
          </p>
          <p className="text-[11px] text-blue-300/80">
            {legs.length > 1 ? "Accumulator" : "Single"} ·{" "}
            {new Date(bet.placedAt).toLocaleString("en-GB")}
          </p>
        </div>
        <div className="p-4">
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-[#172a4a] p-3 text-center text-xs">
            <div>
              <span className="block text-[10px] uppercase text-blue-300">
                Status
              </span>
              <strong
                className={
                  bet.status === "won"
                    ? "text-emerald-400"
                    : bet.status === "lost"
                      ? "text-rose-400"
                      : "text-amber-300"
                }
              >
                {bet.status === "won" ? "PAID OUT" : bet.status.toUpperCase()}
              </strong>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-blue-300">
                Odds
              </span>
              <strong>{odds.toFixed(2)}</strong>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-blue-300">
                Stake
              </span>
              ₦{bet.stake.toLocaleString("en-NG")}
            </div>
            <div>
              <span className="block text-[10px] uppercase text-blue-300">
                Return
              </span>
              <span className="text-emerald-400">
                ₦{bet.potentialPayout.toLocaleString("en-NG")}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-white p-3 text-black">
            <p className="text-sm font-bold">
              {legs.length > 1
                ? "Accumulator · " + legs.length + " legs"
                : home + " vs " + away}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {legs.length > 1 ? legs.length + " selections" : "Selection: " + sel}
            </p>
          </div>
            <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-white/20 py-2 text-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(bet.id);
              }}
            >
              Copy ID
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintTicket({
  bet,
  matches,
  teams,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
}) {
  const legs = betLegs(bet);
  const odds = totalOdds(bet);
  return (
    <div className="p-6 text-black">
      <h1 className="text-xl font-bold">FUNAAB BetSim</h1>
      <p className="text-xs">Ticket {bet.id}</p>
      <p className="text-xs">
        {new Date(bet.placedAt).toLocaleString("en-GB")} · {bet.status}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {legs.map((leg, i) => {
          const m = matches[leg.matchId];
          const h = m ? teams[m.homeTeamId]?.name : "Home";
          const a = m ? teams[m.awayTeamId]?.name : "Away";
          return (
            <li key={i}>
              {h} vs {a} —{" "}
              {formatSelectionLabel(leg.selectionId, leg.selectionLabel)} @{" "}
              {leg.odds.toFixed(2)}
            </li>
          );
        })}
      </ul>
      <p className="mt-4">
        Stake ₦{bet.stake.toLocaleString()} · Odds {odds.toFixed(2)} · Return ₦
        {bet.potentialPayout.toLocaleString()}
      </p>
    </div>
  );
}
   
