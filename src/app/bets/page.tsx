"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Bet, Team, Match } from "@/types/domain";

const STATUS_BADGE: Record<Bet["status"], string> = {
  open: "bg-ink-muted/15 text-ink-muted",
  won: "bg-win/15 text-win",
  lost: "bg-loss/15 text-loss",
  void: "bg-ink-muted/15 text-ink-muted",
};

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

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-6 pb-28">
      <h1 className="mb-4 font-display text-xl font-semibold">My bets</h1>

      {bets.length === 0 && (
        <p className="text-ink-muted">No bets placed yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {bets.map((bet) => {
          const match = matches[bet.matchId];
          const home = match ? teams[match.homeTeamId] : undefined;
          const away = match ? teams[match.awayTeamId] : undefined;

          return (
            <div key={bet.id} className="overflow-hidden rounded-xl bg-surface shadow-sm">
              <div className="flex items-center justify-between px-4 pt-3">
                <p className="text-xs text-ink-muted">
                  {new Date(bet.placedAt).toLocaleString("en-NG", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[bet.status]}`}
                >
                  <StatusIcon status={bet.status} />
                  {bet.status}
                </span>
              </div>

              <div className="my-3 border-t border-dashed border-ink-muted/25" />

              <div className="flex items-center justify-between px-4">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium">{home?.name ?? "Unknown team"}</p>
<p className="line-clamp-2 font-medium">{away?.name ?? "Unknown team"}</p>
<p className="mt-0.5 text-xs text-ink-muted">
  Pick: {bet.selectionId === "home" ? home?.name ?? bet.selectionLabel : bet.selectionId === "away" ? away?.name ?? bet.selectionLabel : bet.selectionLabel} · Match Winner
</p>
                </div>
                <span className="shrink-0 rounded-md bg-brand/10 px-2 py-1 text-sm font-semibold text-brand">
                  {bet.oddsAtPlacement.toFixed(2)}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between bg-bg px-4 py-2.5 text-sm">
                <span className="text-ink-muted">
                  Stake ₦{bet.stake.toLocaleString("en-NG")}
                </span>
                <span className="font-medium">
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
