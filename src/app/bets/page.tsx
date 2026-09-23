"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Bet, Team, Match } from "@/types/domain";

const STATUS_STYLES: Record<Bet["status"], string> = {
  open: "text-ink-muted",
  won: "text-win",
  lost: "text-loss",
  void: "text-ink-muted",
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

      <div className="flex flex-col divide-y divide-ink-muted/20 rounded-xl bg-surface">
        {bets.map((bet) => {
          const match = matches[bet.matchId];
          const home = match ? teams[match.homeTeamId] : undefined;
          const away = match ? teams[match.awayTeamId] : undefined;

          return (
            <div key={bet.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {home?.shortName ?? "?"} v {away?.shortName ?? "?"}
                </p>
                <p className="text-xs text-ink-muted">
                  {bet.selectionLabel} @ {bet.oddsAtPlacement.toFixed(2)} · Stake ₦
                  {bet.stake.toLocaleString("en-NG")}
                </p>
                <p className="text-xs text-ink-muted">
                  {new Date(bet.placedAt).toLocaleString("en-NG", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold capitalize ${STATUS_STYLES[bet.status]}`}>
                  {bet.status}
                </p>
                <p className="text-xs text-ink-muted">
                  {bet.status === "open" ? "Potential" : "Payout"} ₦
                  {bet.potentialPayout.toLocaleString("en-NG")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
