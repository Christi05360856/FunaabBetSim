"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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

// An "open" bet on a match that has since kicked off should read LIVE/HT, not
// a flat "Open" — derived from the same clock the fixtures page uses, no
// extra Firestore field needed. Won/Lost/Void just pass through unchanged.
type DisplayStatus = { label: string; className: string; pulse: boolean };

function displayStatus(bet: Bet, match: Match | undefined): DisplayStatus {
  if (bet.status !== "open" || !match) {
    return { label: bet.status, className: STATUS_BADGE[bet.status], pulse: false };
  }
  const clock = deriveClockState(match);
  if (clock.phase === "first_half" || clock.phase === "second_half") {
    return { label: `LIVE ${clock.display}`, className: "bg-loss/15 text-loss", pulse: true };
  }
  if (clock.phase === "halftime") {
    return { label: "HT", className: "bg-accent/20 text-accent", pulse: false };
  }
  if (clock.phase === "full_time") {
    return { label: "Awaiting result", className: "bg-ink-muted/15 text-ink-muted", pulse: false };
  }
  return { label: "Open", className: STATUS_BADGE.open, pulse: false };
}

export default function BetsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Record<string, Team>>({});

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsubBets = onSnapshot(
      query(collection(db, "bets"), where("uid", "==", user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Bet);
        list.sort((a, b) => b.placedAt - a.placedAt);
        setBets(list);
      }
    );
    const unsubMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const map: Record<string, Match> = {};
      snap.docs.forEach((d) => {
        const match = d.data() as Match;
        map[match.id] = match;
      });
      setMatches(map);
    });
    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const map: Record<string, Team> = {};
      snap.docs.forEach((d) => {
        const team = d.data() as Team;
        map[team.id] = team;
      });
      setTeams(map);
    });
    return () => {
      unsubBets();
      unsubMatches();
      unsubTeams();
    };
  }, [user]);

  // Ticks every 30s so a bet's badge moves from "Open" to "LIVE" to
  // "Awaiting result" without a page refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  void now; // forces the periodic re-render below; deriveClockState reads Date.now() itself

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-5 pb-28">
      <h1 className="mb-4 font-display text-xl font-bold">My Bets</h1>

      {bets.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface py-12 text-center shadow-card">
          <p className="font-medium">No bets yet</p>
          <p className="text-sm text-ink-muted">Head to Fixtures to place your first one.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {bets.map((bet) => {
          const match = matches[bet.matchId];
          const home = match ? teams[match.homeTeamId] : undefined;
          const away = match ? teams[match.awayTeamId] : undefined;
          const status = displayStatus(bet, match);

          return (
            <div key={bet.id} className="overflow-hidden rounded-2xl bg-surface shadow-card">
              <div className="flex items-center justify-between px-4 pt-3.5">
                <p className="text-xs font-medium text-ink-muted">
                  {new Date(bet.placedAt).toLocaleString("en-NG", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}
                >
                  {status.pulse ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
                  ) : (
                    <StatusIcon status={bet.status} />
                  )}
                  {status.label}
                </span>
              </div>

              <div className="my-3 border-t border-dashed border-ink-muted/25" />

              <div className="flex items-center justify-between gap-3 px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-snug">{home?.name ?? "Unknown team"}</p>
                  <p className="truncate text-[15px] font-semibold leading-snug">{away?.name ?? "Unknown team"}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">Pick: {bet.selectionLabel} · Match Winner</p>
                </div>
                <span className="shrink-0 rounded-lg bg-brand/10 px-2.5 py-1.5 font-display text-base font-bold text-brand tabular-nums">
                  {bet.oddsAtPlacement.toFixed(2)}
                </span>
              </div>

              <div className="mt-3.5 flex items-center justify-between bg-surface-raised px-4 py-2.5 text-sm">
                <span className="text-ink-muted">Stake ₦{bet.stake.toLocaleString("en-NG")}</span>
                <span className="font-semibold">
                  {bet.status === "open" ? "Potential " : "Payout "}
                  ₦{bet.potentialPayout.toLocaleString("en-NG")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function StatusIcon({ status }: { status: Bet["status"] }) {
  if (status === "won") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "lost") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
