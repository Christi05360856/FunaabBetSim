"use client";

/**
 * Instant Virtual Football — demo chips only.
 * League tabs · flat 1X2 · expand for O/U & BTTS · next round.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import type {
  VirtualMatchPublic,
  VirtualRoundPublic,
} from "@/types/virtual";
import { VIRTUAL_LEAGUES } from "@/lib/virtual/teamPool";

type PickLeg = {
  matchId: string;
  home: string;
  away: string;
  market: "1x2" | "ou25" | "btts";
  pick: string;
  label: string;
  odds: number;
};

type PlayResult = {
  allWon: boolean;
  payout: number;
  profit: number;
  combinedOdds: number;
  legs: Array<{
    home: string;
    away: string;
    market: string;
    pick: string;
    odds: number;
    homeGoals: number;
    awayGoals: number;
    won: boolean;
  }>;
  balance: number;
};

function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

export default function InstantVirtualPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState<VirtualRoundPublic | null>(null);
  const [league, setLeague] = useState(VIRTUAL_LEAGUES[0]!.id);
  const [legs, setLegs] = useState<PickLeg[]>([]);
  const [stake, setStake] = useState("100");
  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [sim, setSim] = useState<PlayResult | null>(null);

  useEffect(() => {
    if (!user) {
      setToken(null);
      return;
    }
    void user.getIdToken().then(setToken);
  }, [user]);

  const loadBalance = useCallback(async (t: string) => {
    try {
      const res = await fetch("/api/casino/balance", {
        headers: { Authorization: "Bearer " + t },
      });
      const body = await res.json();
      if (body.balance != null) setBalance(Number(body.balance));
    } catch {
      /* ignore */
    }
  }, []);

  const dealBoard = useCallback(async () => {
    if (!token) return;
    setDealing(true);
    setErr(null);
    setResult(null);
    setSim(null);
    setLegs([]);
    try {
      const res = await fetch("/api/virtual/round", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not deal board");
      setRound(body.round as VirtualRoundPublic);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deal failed");
    } finally {
      setDealing(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      void loadBalance(token);
      void dealBoard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const matches = useMemo(
    () => (round?.matches ?? []).filter((m) => m.league === league),
    [round, league]
  );

  function togglePick(
    match: VirtualMatchPublic,
    leg: Omit<PickLeg, "home" | "away" | "matchId">
  ) {
    setResult(null);
    setSim(null);
    setLegs((prev) => {
      const without = prev.filter((l) => l.matchId !== match.id);
      const same = prev.find(
        (l) =>
          l.matchId === match.id &&
          l.market === leg.market &&
          l.pick === leg.pick
      );
      if (same) return without;
      return [
        ...without,
        {
          matchId: match.id,
          home: match.home,
          away: match.away,
          ...leg,
        },
      ];
    });
  }

  const combinedOdds = useMemo(
    () =>
      legs.length === 0
        ? 0
        : Math.round(legs.reduce((a, l) => a * l.odds, 1) * 100) / 100,
    [legs]
  );

  const stakeNum = Number(stake) || 0;
  const potential =
    legs.length > 0 && stakeNum > 0
      ? Math.floor(stakeNum * combinedOdds * 100) / 100
      : 0;

  async function place() {
    if (!token || !round || legs.length === 0) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    setSim(null);
    try {
      const res = await fetch("/api/virtual/play", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roundId: round.id,
          stake: stakeNum,
          legs: legs.map((l) => ({
            matchId: l.matchId,
            market: l.market,
            pick: l.pick,
            odds: l.odds,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Play failed");
      const pr = body as PlayResult;
      setSim(pr);
      setTimeout(() => {
        setResult(pr);
        setSim(null);
        setBalance(pr.balance);
        setLegs([]);
      }, 1400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-ink-muted">
        Loading…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-bold text-ink">Instant Virtual</p>
        <p className="mt-2 text-sm text-ink-muted">
          Sign in to play with demo chips.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg pb-40 text-ink">
      <header className="sticky top-0 z-30 border-b border-ink-muted/10 bg-emerald-700 px-3 py-2.5 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/casino" className="text-lg leading-none">
              ←
            </Link>
            <h1 className="text-base font-bold">Instant Football</h1>
          </div>
          <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tabular-nums">
            {balance == null ? "…" : chips(balance)} chips
          </div>
        </div>
      </header>

      <div className="sticky top-[48px] z-20 flex gap-1 overflow-x-auto border-b border-ink-muted/10 bg-surface px-2 py-2">
        {VIRTUAL_LEAGUES.map((lg) => (
          <button
            key={lg.id}
            type="button"
            onClick={() => setLeague(lg.id)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold " +
              (league === lg.id
                ? "bg-emerald-600 text-white"
                : "bg-ink-muted/10 text-ink-muted")
            }
          >
            {lg.label}
          </button>
        ))}
      </div>

      <div className="px-2 pt-2">
        {err && (
          <p className="mb-2 rounded-xl bg-rose-600 px-3 py-2 text-center text-xs font-semibold text-white">
            {err}
          </p>
        )}

        {result && (
          <section
            className={
              "mb-2 rounded-2xl border px-3 py-3 " +
              (result.allWon
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10")
            }
          >
            <p className="text-center text-sm font-bold">
              {result.allWon ? "Won" : "Lost"}{" "}
              <span className="tabular-nums">
                {result.allWon
                  ? "+" + chips(result.profit)
                  : chips(result.profit)}
              </span>
            </p>
            <ul className="mt-2 space-y-1">
              {result.legs.map((l, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="min-w-0 truncate">
                    {l.home} {l.homeGoals}–{l.awayGoals} {l.away}
                  </span>
                  <span
                    className={
                      "shrink-0 font-bold " +
                      (l.won ? "text-emerald-700" : "text-rose-700")
                    }
                  >
                    {l.won ? "HIT" : "MISS"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-bold uppercase text-ink-muted">
          <span className="min-w-0 flex-1">Match</span>
          <span className="w-14 text-center">1</span>
          <span className="w-14 text-center">X</span>
          <span className="w-14 text-center">2</span>
        </div>

        <div className="space-y-1.5">
          {matches.map((m) => {
            const active = legs.find((l) => l.matchId === m.id);
            const openMore = moreId === m.id;
            return (
              <article
                key={m.id}
                className="overflow-hidden rounded-xl border border-ink-muted/12 bg-surface"
              >
                <div className="flex items-center gap-1 px-2 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      setMoreId((id) => (id === m.id ? null : m.id))
                    }
                  >
                    <p className="truncate text-xs font-bold">
                      {m.home}{" "}
                      <span className="font-normal text-ink-muted">vs</span>{" "}
                      {m.away}
                    </p>
                    {active && (
                      <p className="truncate text-[10px] text-emerald-700">
                        {active.label} @ {active.odds.toFixed(2)}
                      </p>
                    )}
                  </button>
                  {(
                    [
                      ["home", m.odds1x2.home, "Home"],
                      ["draw", m.odds1x2.draw, "Draw"],
                      ["away", m.odds1x2.away, "Away"],
                    ] as const
                  ).map(([pick, odds, label]) => {
                    const on =
                      active?.market === "1x2" && active.pick === pick;
                    return (
                      <button
                        key={pick}
                        type="button"
                        onClick={() =>
                          togglePick(m, {
                            market: "1x2",
                            pick,
                            label,
                            odds,
                          })
                        }
                        className={
                          "w-14 shrink-0 rounded-lg py-2 text-center text-xs font-bold tabular-nums " +
                          (on
                            ? "bg-emerald-600 text-white"
                            : "bg-emerald-500/10 text-ink")
                        }
                      >
                        {odds.toFixed(2)}
                      </button>
                    );
                  })}
                </div>

                {openMore && (
                  <div className="space-y-2 border-t border-ink-muted/10 px-2 pb-2 pt-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["over", "Over 2.5", m.oddsOu25.over],
                          ["under", "Under 2.5", m.oddsOu25.under],
                        ] as const
                      ).map(([pick, label, odds]) => {
                        const on =
                          active?.market === "ou25" && active.pick === pick;
                        return (
                          <button
                            key={pick}
                            type="button"
                            onClick={() =>
                              togglePick(m, {
                                market: "ou25",
                                pick,
                                label,
                                odds,
                              })
                            }
                            className={
                              "rounded-lg py-2 text-center text-[11px] font-bold " +
                              (on
                                ? "bg-emerald-600 text-white"
                                : "bg-bg text-ink")
                            }
                          >
                            {label} · {odds.toFixed(2)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["yes", "BTTS Yes", m.oddsBtts.yes],
                          ["no", "BTTS No", m.oddsBtts.no],
                        ] as const
                      ).map(([pick, label, odds]) => {
                        const on =
                          active?.market === "btts" && active.pick === pick;
                        return (
                          <button
                            key={pick}
                            type="button"
                            onClick={() =>
                              togglePick(m, {
                                market: "btts",
                                pick,
                                label,
                                odds,
                              })
                            }
                            className={
                              "rounded-lg py-2 text-center text-[11px] font-bold " +
                              (on
                                ? "bg-emerald-600 text-white"
                                : "bg-bg text-ink")
                            }
                          >
                            {label} · {odds.toFixed(2)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {!dealing && matches.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-muted">
            No matches — deal a new board.
          </p>
        )}
      </div>

      {sim && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-emerald-900 p-4 text-white shadow-xl">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-emerald-200">
              Quick games
            </p>
            <div className="space-y-2">
              {sim.legs.map((l, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm font-bold"
                >
                  <span className="truncate">
                    {l.home}{" "}
                    <span className="tabular-nums text-emerald-200">
                      {l.homeGoals}–{l.awayGoals}
                    </span>{" "}
                    {l.away}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-emerald-200">
              Settling…
            </p>
          </div>
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-muted/15 bg-surface/95 px-2 pt-2 backdrop-blur"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-lg">
          {legs.length > 0 && (
            <div className="mb-1.5 flex items-center justify-between px-1 text-[11px]">
              <span className="font-semibold text-ink-muted">
                {legs.length} pick{legs.length === 1 ? "" : "s"} · @
                {combinedOdds.toFixed(2)}
              </span>
              <button
                type="button"
                className="font-bold text-rose-600"
                onClick={() => setLegs([])}
              >
                Clear
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={dealing}
              onClick={() => void dealBoard()}
              className="w-[32%] rounded-xl border border-ink-muted/20 py-3 text-xs font-bold text-ink disabled:opacity-50"
            >
              {dealing ? "…" : "Next round"}
            </button>
            <input
              type="number"
              inputMode="decimal"
              min={CASINO_MIN_STAKE}
              max={CASINO_MAX_STAKE}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-[22%] rounded-xl border border-ink-muted/20 bg-bg px-2 py-2 text-center text-sm font-bold tabular-nums"
            />
            <button
              type="button"
              disabled={
                busy || legs.length === 0 || stakeNum < CASINO_MIN_STAKE
              }
              onClick={() => void place()}
              className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white disabled:opacity-45"
            >
              {busy
                ? "Playing…"
                : legs.length === 0
                  ? "Betslip"
                  : "Kick off · " + chips(potential)}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
        }
          
