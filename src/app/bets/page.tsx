"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Bet, Team, Match } from "@/types/domain";
import { deriveClockState } from "@/lib/domain/matchClock";

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

type Tab = "open" | "history";

export default function BetsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bets, setBets] = useState<Bet[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    
    const unsubBets = onSnapshot(
      query(collection(db, "bets"), where("uid", "==", user.uid), orderBy("placedAt", "desc")),
      (snap) => {
        const betList = snap.docs.map((d) => d.data() as Bet);
        setBets(betList);
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pt-5 pb-28">
      <h1 className="font-display text-xl font-bold">My Bets</h1>

      {/* Tabs */}
      <div className="flex rounded-xl bg-surface p-1 shadow-card">
        <button
          onClick={() => setActiveTab("open")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "open" ? "bg-brand text-white" : "text-ink-muted"
          }`}
        >
          Open Bets ({openBets.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "history" ? "bg-brand text-white" : "text-ink-muted"
          }`}
        >
          Bet History ({historyBets.length})
        </button>
      </div>

      {displayBets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">🎫</div>
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
            <BetCard key={bet.id} bet={bet} teams={teams} matches={matches} now={now} />
          ))}
        </div>
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
  
  const isLive = match && ["live", "halftime", "second_half"].includes(match.status);
  const clock = match ? deriveClockState(match, now) : null;

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[bet.status]}`}>
          {STATUS_LABEL[bet.status]}
        </span>
        {isLive && clock && (
          <span className="flex items-center gap-1 text-xs font-medium text-loss">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
            {clock.display}
          </span>
        )}
      </div>

      {/* Match info */}
      <div className="mt-3">
        <p className="text-sm font-semibold">
          {home?.name ?? "Home"} vs {away?.name ?? "Away"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {bet.selectionLabel} @ {bet.oddsAtPlacement.toFixed(2)}
        </p>
      </div>

      {/* Bet details */}
      <div className="mt-3 flex items-center justify-between border-t border-ink-muted/10 pt-3">
        <div>
          <p className="text-xs text-ink-muted">Stake</p>
          <p className="font-display text-sm font-bold">₦{bet.stake.toLocaleString("en-NG")}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-ink-muted">Potential Win</p>
          <p className="font-display text-sm font-bold text-win">
            ₦{bet.potentialPayout.toLocaleString("en-NG")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">Placed</p>
          <p className="text-sm">{new Date(bet.placedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
        </div>
      </div>

      {/* Result */}
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
