"use client";

import { useEffect, useMemo, useState } from "react";
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

  // One celebration for all newly settled wins since last visit
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
      <div className="flex items-center justify-between">
        <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + STATUS_BADGE[bet.status]}>
          {STATUS_LABEL[bet.status]}
        </span>
        {isLive && clock && (
          <span className="flex items-center gap-1 text-xs font-medium text-loss">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
            {clock.display}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {home?.name ?? "Home"} vs {away?.name ?? "Away"}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {bet.selectionLabel} @ {bet.oddsAtPlacement.toFixed(2)}
          </p>
        </div>
        {score && (
          <span
            className={
              "shrink-0 font-display text-sm font-bold tabular-nums " +
              (score.live ? "text-loss" : "text-ink")
            }
          >
            {score.home} – {score.away}
            {score.live && (
              <span className="ml-1 text-[9px] font-semibold uppercase">Live</span>
            )}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink-muted/10 pt-3">
        <div>
          <p className="text-xs text-ink-muted">Stake</p>
          <p className="font-display text-sm font-bold">
            ₦{bet.stake.toLocaleString("en-NG")}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-ink-muted">
            {bet.status === "won" ? "Won" : "Potential"}
          </p>
          <p className="font-display text-sm font-bold text-win">
            ₦{bet.potentialPayout.toLocaleString("en-NG")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">Placed</p>
          <p className="text-sm">
            {new Date(bet.placedAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
            })}
          </p>
        </div>
      </div>

      {bet.status === "won" && (
        <div className="mt-3 rounded-lg bg-win/10 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-win">
            +₦{bet.potentialPayout.toLocaleString("en-NG")}
          </p>
        </div>
      )}
      {bet.status === "lost" && (
        <div className="mt-3 rounded-lg bg-loss/10 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-loss">Lost</p>
        </div>
      )}
      {bet.status === "void" && (
        <div className="mt-3 rounded-lg bg-ink-muted/10 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-ink-muted">Void - Stake Refunded</p>
        </div>
      )}
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

  const statusLine =
    bet.status === "open" && isLive
      ? "Live"
      : STATUS_LABEL[bet.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Bet details</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface-raised px-3 py-1 text-sm text-ink-muted"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + STATUS_BADGE[bet.status]}>
            {statusLine}
          </span>
          {isLive && clock && (
            <span className="flex items-center gap-1 text-xs font-medium text-loss">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
              {clock.display}
            </span>
          )}
        </div>

        <div className="rounded-xl bg-surface-raised p-4">
          <p className="text-xs text-ink-muted">
            {new Date(bet.placedAt).toLocaleString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {home?.name ?? "Home"} vs {away?.name ?? "Away"}
          </p>
          {score && (
            <p
              className={
                "mt-2 font-display text-2xl font-bold tabular-nums " +
                (score.live ? "text-loss" : "text-ink")
              }
            >
              {score.home} – {score.away}
              {score.live && (
                <span className="ml-2 text-xs font-semibold uppercase">Live</span>
              )}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-muted">
            {bet.selectionLabel} @ {bet.oddsAtPlacement.toFixed(2)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-raised p-3">
            <p className="text-xs text-ink-muted">Odds</p>
            <p className="font-display text-lg font-bold">
              {bet.oddsAtPlacement.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-raised p-3">
            <p className="text-xs text-ink-muted">Stake</p>
            <p className="font-display text-lg font-bold">
              ₦{bet.stake.toLocaleString("en-NG")}
            </p>
          </div>
          <div className="rounded-xl bg-surface-raised p-3">
            <p className="text-xs text-ink-muted">
              {bet.status === "won" ? "Winnings" : "Potential payout"}
            </p>
            <p className="font-display text-lg font-bold text-win">
              ₦{bet.potentialPayout.toLocaleString("en-NG")}
            </p>
          </div>
          <div className="rounded-xl bg-surface-raised p-3">
            <p className="text-xs text-ink-muted">Status</p>
            <p className="text-lg font-bold">{statusLine}</p>
          </div>
        </div>

        {bet.status === "won" && (
          <div className="mt-4 rounded-xl bg-win/15 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-win">Paid out</p>
            <p className="font-display text-xl font-bold text-win">
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
            <p className="text-sm font-semibold text-ink-muted">
              Void — stake refunded
            </p>
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
  const title =
    count === 1 ? "YOU WON" : "YOU WON " + count + " BETS";

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
