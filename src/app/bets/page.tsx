"use client";

/**
 * Phase 3 — My Bets / Ticket Experience
 * Tabs: All · Open · Won · Lost · Void
 * Cards + detail with settlement timeline · Bet Again · Share
 * Server-derived history only (client never mutates status).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import type { Bet, Match, Team } from "@/types/domain";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatMoney, formatMoneyFull } from "@/lib/domain/selectionLabel";
import { BetFilterTabs } from "@/components/bets/BetFilterTabs";
import { BetTicketCard } from "@/components/bets/BetTicketCard";
import { BetTicketDetail } from "@/components/bets/BetTicketDetail";
import {
  type BetFilter,
  betLegs,
  countByFilter,
  filterBets,
} from "@/components/bets/myBetsUtils";

const SEEN_WINS_KEY = "funaab_seen_win_ids";

function loadSeenWinIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_WINS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenWinIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_WINS_KEY, JSON.stringify([...ids].slice(-80)));
  } catch {
    /* ignore */
  }
}

export default function MyBetsPage() {
  const { user, loading } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [filter, setFilter] = useState<BetFilter>("open");
  const [detailBet, setDetailBet] = useState<Bet | null>(null);
  const [celebration, setCelebration] = useState<{
    count: number;
    totalPayout: number;
    ids: string[];
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "bets"), where("uid", "==", user.uid)),
      (snap) => {
        setBets(
          snap.docs
            .map((d) => ({ ...(d.data() as Bet), id: d.id }))
            .sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0))
        );
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (bets.length === 0) return;
    let cancelled = false;

    async function hydrateNames() {
      const matchIds = new Set<string>();
      for (const bet of bets) {
        for (const leg of betLegs(bet)) {
          if (leg.matchId) matchIds.add(leg.matchId);
        }
      }
      if (matchIds.size === 0) return;

      const matchMap: Record<string, Match> = {};
      const teamIds = new Set<string>();

      await Promise.all(
        [...matchIds].map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "matches", id));
            if (snap.exists()) {
              const m = { ...(snap.data() as Match), id: snap.id };
              matchMap[id] = m;
              if (m.homeTeamId) teamIds.add(m.homeTeamId);
              if (m.awayTeamId) teamIds.add(m.awayTeamId);
            }
          } catch {
            /* skip */
          }
        })
      );
      if (cancelled) return;
      setMatches((prev) => ({ ...prev, ...matchMap }));

      const teamMap: Record<string, Team> = {};
      await Promise.all(
        [...teamIds].map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "teams", id));
            if (snap.exists()) {
              teamMap[id] = { ...(snap.data() as Team), id: snap.id };
            }
          } catch {
            /* skip */
          }
        })
      );
      if (cancelled) return;
      setTeams((prev) => ({ ...prev, ...teamMap }));
    }

    void hydrateNames();
    return () => {
      cancelled = true;
    };
  }, [bets]);

  // Win celebration once per ticket
  useEffect(() => {
    if (bets.length === 0) return;
    const seen = loadSeenWinIds();
    const newWins = bets.filter(
      (b) => b.status === "won" && !b.hidden && !seen.has(b.id)
    );
    if (newWins.length === 0) return;
    const totalPayout = newWins.reduce((s, b) => {
      const p = Number(b.payout);
      return s + (Number.isFinite(p) && p > 0 ? p : b.potentialPayout || 0);
    }, 0);
    setCelebration({
      count: newWins.length,
      totalPayout,
      ids: newWins.map((b) => b.id),
    });
  }, [bets]);

  function dismissCelebration() {
    if (celebration) {
      const seen = loadSeenWinIds();
      for (const id of celebration.ids) seen.add(id);
      saveSeenWinIds(seen);
    }
    setCelebration(null);
  }

  async function hideBet(betId: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch("/api/bets/hide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ betId }),
      });
    } catch {
      /* ignore */
    }
  }

  const counts = useMemo(() => countByFilter(bets), [bets]);
  const list = useMemo(() => filterBets(bets, filter), [bets, filter]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-bold text-ink">My Bets</p>
        <p className="mt-2 text-sm text-ink-muted">Sign in to see your tickets.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-bg pb-24">
      <header className="sticky top-0 z-20 border-b border-ink-muted/15 bg-surface/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold text-ink">My Bets</h1>
        <div className="mt-3">
          <BetFilterTabs active={filter} counts={counts} onChange={setFilter} />
        </div>
      </header>

      <div className="space-y-3 px-3 py-3">
        {list.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-muted">
            {filter === "open"
              ? "No open bets."
              : filter === "all"
                ? "No bets yet."
                : "No " + filter + " tickets."}
          </p>
        )}

        {list.map((bet) => (
          <BetTicketCard
            key={bet.id}
            bet={bet}
            matches={matches}
            teams={teams}
            onOpen={() => setDetailBet(bet)}
            onMenu={
              bet.status !== "open"
                ? () => void hideBet(bet.id)
                : undefined
            }
          />
        ))}
      </div>

      {detailBet && (
        <BetTicketDetail
          bet={detailBet}
          matches={matches}
          teams={teams}
          onClose={() => setDetailBet(null)}
        />
      )}

      {celebration && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
          onClick={dismissCelebration}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-3xl" aria-hidden>
              🎉
            </p>
            <p className="mt-2 text-lg font-bold text-ink">
              {celebration.count === 1
                ? "You won!"
                : celebration.count + " wins settled"}
            </p>
            <p
              className="mt-3 font-display text-3xl font-bold tabular-nums text-emerald-600"
              title={formatMoneyFull(celebration.totalPayout)}
            >
              +{formatMoney(celebration.totalPayout)}
            </p>
            <button
              type="button"
              onClick={dismissCelebration}
              className="mt-6 w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white"
            >
              Nice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
