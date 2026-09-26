"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Bet, Team, Match } from "@/types/domain";
import { deriveClockState } from "@/lib/domain/matchClock";
import Link from "next/link";

const STATUS_BADGE: Record<Bet["status"], string> = {
  open: "bg-ink-muted/15 text-ink-muted",
  won: "bg-win/15 text-win",
  lost: "bg-loss/15 text-loss",
  void: "bg-ink-muted/15 text-ink-muted",
};

const STATUS_LABEL: Record<Bet["status"], string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

const SEEN_WINS_KEY = "funaab-bets-seen-won-at";

type Tab = "open" | "history";

function matchScore(match: Match | undefined): {
  home: number;
  away: number;
  live: boolean;
} | null {
  if (!match) return null;
  if (match.status === "settled" && match.homeScore != null && match.awayScore != null) {
    return { home: match.homeScore, away: match.awayScore, live: false };
  }
  if (match.currentHomeScore != null && match.currentAwayScore != null) {
    return { home: match.currentHomeScore, away: match.currentAwayScore, live: true };
  }
  return null;
}

function shortTicketId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || id.slice(0, 8).toUpperCase();
}

export default function BetsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bets, setBets] = useState<Bet[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [winCelebration, setWinCelebration] = useState<{
    count: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    const unsubBets = onSnapshot(
      query(collection(db, "bets"), where("uid", "==", user.uid)),
      (snap) => {
        const betList = snap.docs
          .map((d) => d.data() as Bet)
          .sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0));
        setBets(betList);
        setLoadError(null);
      },
      (err) => {
        console.error("bets listener failed", err);
        setLoadError(err.message || "Could not load bets");
      }
    );

    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const map: Record<string, Team> = {};
      snap.docs.forEach((d) => {
        const team = d.data() as Team;
        if (team?.id) map[team.id] = team;
      });
      setTeams(map);
    });

    const unsubMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const map: Record<string, Match> = {};
      snap.docs.forEach((d) => {
        const match = d.data() as Match;
        if (match?.id) map[match.id] = match;
      });
      setMatches(map);
    });

    return () => {
      unsubBets();
      unsubTeams();
      unsubMatches();
    };
  }, [user]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user || bets.length === 0) return;
    let seenAt = 0;
    try {
      seenAt = Number(localStorage.getItem(SEEN_WINS_KEY) || "0");
    } catch {
      /* ignore */
    }
    const freshWins = bets.filter(
      (b) => b.status === "won" && (b.settledAt ?? 0) > seenAt
    );
    if (freshWins.length === 0) return;
    const total = freshWins.reduce((s, b) => s + (b.potentialPayout || 0), 0);
    setWinCelebration({ count: freshWins.length, total });
  }, [user, bets]);

  function dismissWinCelebration() {
    const maxSettled = bets
      .filter((b) => b.status === "won")
      .reduce((m, b) => Math.max(m, b.settledAt ?? 0), 0);
    try {
      localStorage.setItem(SEEN_WINS_KEY, String(maxSettled || Date.now()));
    } catch {
      /* ignore */
    }
    setWinCelebration(null);
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  const openBets = bets.filter((b) => b.status === "open");
  const historyBets = bets.filter((b) => b.status !== "open");
  const displayBets = activeTab === "open" ? openBets : historyBets;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pb-28 pt-5">
      <h1 className="font-display text-xl font-bold">My Bets</h1>

      <div className="flex rounded-xl bg-surface p-1 shadow-card">
        <button
          type="button"
          onClick={() => setActiveTab("open")}
          className={
            "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors " +
            (activeTab === "open" ? "bg-brand text-white" : "text-ink-muted")
          }
        >
          Open Bets ({openBets.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={
            "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors " +
            (activeTab === "history" ? "bg-brand text-white" : "text-ink-muted")
          }
        >
          Bet History ({historyBets.length})
        </button>
      </div>

      {loadError && (
        <p className="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">{loadError}</p>
      )}

      {displayBets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 text-5xl">🎫</div>
          <p className="text-ink-muted">
            {activeTab === "open" ? "No open bets" : "No bet history yet"}
          </p>
          <Link href="/fixtures" className="mt-4 text-sm font-medium text-brand underline">
            Browse fixtures
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="px-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Singles
          </p>
          {displayBets.map((bet) => (
            <button
              key={bet.id}
              type="button"
              onClick={() => setSelectedBet(bet)}
              className="w-full text-left"
            >
              <BetCard bet={bet} teams={teams} matches={matches} now={now} />
            </button>
          ))}
        </div>
      )}

      {selectedBet && (
        <BetDetailSheet
          bet={selectedBet}
          teams={teams}
          matches={matches}
          now={now}
          onClose={() => setSelectedBet(null)}
        />
      )}

      {winCelebration && (
        <WinCelebrationModal
          count={winCelebration.count}
          total={winCelebration.total}
          onClose={dismissWinCelebration}
        />
      )}
    </main>
  );
}

function BetCard({
  bet,
  teams,
  matches,
  now,
}: {
  bet: Bet;
  teams: Record<string, Team>;
  matches: Record<string, Match>;
  now: number;
}) {
  const match = matches[bet.matchId];
  const home = match?.homeTeamId ? teams[match.homeTeamId] : undefined;
  const away = match?.awayTeamId ? teams[match.awayTeamId] : undefined;
  const isLive =
    match && ["live", "halftime", "second_half"].includes(match.status);
  const clock = match ? deriveClockState(match, now) : null;
  const score = matchScore(match);

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand">
            {bet.selectionLabel} @{bet.oddsAtPlacement.toFixed(2)}{" "}
            <span className="font-medium text-ink-muted">1X2</span>
          </p>
          <p className="mt-1 truncate text-sm font-medium">
            {home?.name ?? "Home"} vs {away?.name ?? "Away"}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {new Date(bet.placedAt).toLocaleString("en-NG", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {isLive && clock ? " · " + clock.display : ""}
          </p>
        </div>
        <span className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-bold " + STATUS_BADGE[bet.status]}>
          {STATUS_LABEL[bet.status]}
        </span>
      </div>

      {score && (
        <p
          className={
            "mt-2 text-xs font-medium " + (score.live ? "text-loss" : "text-ink-muted")
          }
        >
          {score.live ? "Live" : "FT"} {score.home}:{score.away}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-ink-muted/10 pt-3 text-sm">
        <div>
          <span className="text-ink-muted">Stake </span>
          <span className="font-semibold">₦{bet.stake.toLocaleString("en-NG")}</span>
        </div>
        <div>
          <span className="text-ink-muted">
            {bet.status === "won" ? "Return " : "Pot. Win "}
          </span>
          <span className="font-semibold text-win">
            ₦{bet.potentialPayout.toLocaleString("en-NG")}
          </span>
        </div>
      </div>
    </div>
  );
}

function BetDetailSheet({
  bet,
  teams,
  matches,
  now,
  onClose,
}: {
  bet: Bet;
  teams: Record<string, Team>;
  matches: Record<string, Match>;
  now: number;
  onClose: () => void;
}) {
  const match = matches[bet.matchId];
  const home = match?.homeTeamId ? teams[match.homeTeamId] : undefined;
  const away = match?.awayTeamId ? teams[match.awayTeamId] : undefined;
  const isLive =
    match && ["live", "halftime", "second_half"].includes(match.status);
  const clock = match ? deriveClockState(match, now) : null;
  const score = matchScore(match);
  const ticketId = shortTicketId(bet.id);

  const pickOk = bet.status === "won";
  const pickFail = bet.status === "lost";
  const pickOpen = bet.status === "open";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      onClick={onClose}
    >
      {/* SportyBet-style red header */}
      <header
        className="flex items-center gap-3 bg-brand px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="text-white" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="flex-1 font-display text-lg font-bold">Ticket Details</h2>
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 pb-28 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ticket summary */}
        <div className="rounded-xl bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-ink-muted">Ticket ID: {ticketId}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {new Date(bet.placedAt).toLocaleString("en-NG", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-2 text-sm font-semibold">Single</p>
            </div>
            <div className="text-right">
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold " +
                  STATUS_BADGE[bet.status]
                }
              >
                {bet.status === "won" && <span>🏆</span>}
                {STATUS_LABEL[bet.status]}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-ink-muted/10 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">
                {bet.status === "won" ? "Total Return" : "Potential Return"}
              </span>
              <span className="font-display font-bold text-win">
                ₦{bet.potentialPayout.toLocaleString("en-NG")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Total Stake</span>
              <span className="font-semibold">₦{bet.stake.toLocaleString("en-NG")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Odds</span>
              <span className="font-semibold">{bet.oddsAtPlacement.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Leg / selection block — SportyBet style */}
        <div className="mt-4 rounded-xl bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">
            {match
              ? new Date(match.kickoffAt).toLocaleString("en-NG", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
            {isLive && clock ? " · " + clock.display : ""}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {home?.name ?? "Home"} vs {away?.name ?? "Away"}
          </p>

          {score && (
            <p className="mt-1 text-xs font-medium text-ink-muted">
              {score.live ? "Live Score" : "FT Score"}{" "}
              <span className={score.live ? "text-loss" : "text-ink"}>
                {score.home}:{score.away}
              </span>
            </p>
          )}

          <div
            className={
              "mt-3 rounded-lg px-3 py-3 " +
              (pickOk
                ? "bg-win/15"
                : pickFail
                  ? "bg-loss/10"
                  : "bg-surface-raised")
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="text-ink-muted">Pick </span>
                  <span className="font-semibold">
                    {bet.selectionLabel} @{bet.oddsAtPlacement.toFixed(2)}
                  </span>
                  {pickOk && <span className="ml-1 text-win">✓</span>}
                  {pickFail && <span className="ml-1 text-loss">✗</span>}
                </p>
                <p className="mt-1 text-xs text-ink-muted">Market 1X2</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Outcome{" "}
                  <span className="font-medium text-ink">
                    {pickOk
                      ? bet.selectionLabel
                      : pickFail
                        ? "Lost"
                        : pickOpen
                          ? "Pending"
                          : "Void"}
                  </span>
                </p>
              </div>
              {pickOk && <span className="text-2xl">🏆</span>}
            </div>
          </div>
        </div>

        {bet.status === "won" && (
          <div className="mt-4 rounded-xl bg-win/15 px-4 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-win">Paid out</p>
            <p className="mt-1 font-display text-2xl font-bold text-win">
              +₦{bet.potentialPayout.toLocaleString("en-NG")}
            </p>
          </div>
        )}
        {bet.status === "lost" && (
          <div className="mt-4 rounded-xl bg-loss/10 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-loss">Lost</p>
          </div>
        )}
        {bet.status === "void" && (
          <div className="mt-4 rounded-xl bg-ink-muted/10 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-ink-muted">Void — stake refunded</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WinCelebrationModal({
  count,
  total,
  onClose,
}: {
  count: number;
  total: number;
  onClose: () => void;
}) {
  const title = count === 1 ? "YOU WON" : "YOU WON " + count + " BETS";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-win/15 text-3xl">
          🏆
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Great result
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-win">{title}</h2>
        <p className="mt-3 font-display text-3xl font-bold tabular-nums">
          ₦{total.toLocaleString("en-NG")}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {count === 1
            ? "Payout added to your balance"
            : "Total payout added to your balance"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
