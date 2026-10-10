"use client";

/**
 * Shared Instant Virtual Football — clock-scheduled rounds, same board for all.
 * Client-only goal-by-goal animation uses results already on the round payload
 * (no extra Firestore listeners / reads).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import type {
  VirtualMatchPublic,
  VirtualMatchResult,
  VirtualRoundPublic,
} from "@/types/virtual";
import { VIRTUAL_LEAGUES } from "@/lib/virtual/teamPool";
import { sfxBet, sfxGoal, sfxLose, sfxWin } from "@/lib/casino/sounds";

type PickLeg = {
  matchId: string;
  home: string;
  away: string;
  market: "1x2" | "ou25" | "btts";
  pick: string;
  odds: number;
  label: string;
};

function chips(n: number) {
  return n.toLocaleString("en-NG");
}

function fmtMs(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function pickLabel(market: string, pick: string) {
  if (market === "1x2") {
    if (pick === "home") return "Home";
    if (pick === "draw") return "Draw";
    return "Away";
  }
  if (market === "ou25") return pick === "over" ? "Over 2.5" : "Under 2.5";
  return pick === "yes" ? "BTTS Yes" : "BTTS No";
}

/** Client-side goal timeline player — pure UI, no network. */
function GoalAnimation({
  matches,
  results,
  onDone,
  skip,
}: {
  matches: VirtualMatchPublic[];
  results: VirtualMatchResult[];
  onDone: () => void;
  skip: boolean;
}) {
  const [minute, setMinute] = useState(0);
  const [scores, setScores] = useState<Record<string, { h: number; a: number }>>(
    {}
  );
  const [lastGoal, setLastGoal] = useState<string | null>(null);
  const doneRef = useRef(false);

  const byId = useMemo(() => {
    const m: Record<string, VirtualMatchPublic> = {};
    matches.forEach((x) => {
      m[x.id] = x;
    });
    return m;
  }, [matches]);

  // All goals sorted by minute
  const timeline = useMemo(() => {
    const events: Array<{
      minute: number;
      matchId: string;
      side: "home" | "away";
    }> = [];
    results.forEach((r) => {
      (r.goals || []).forEach((g) => {
        events.push({ minute: g.minute, matchId: r.matchId, side: g.side });
      });
    });
    events.sort((a, b) => a.minute - b.minute);
    return events;
  }, [results]);

  useEffect(() => {
    // Init 0-0
    const init: Record<string, { h: number; a: number }> = {};
    results.forEach((r) => {
      init[r.matchId] = { h: 0, a: 0 };
    });
    setScores(init);
    setMinute(0);
    setLastGoal(null);
    doneRef.current = false;
  }, [results]);

  useEffect(() => {
    if (skip) {
      const final: Record<string, { h: number; a: number }> = {};
      results.forEach((r) => {
        final[r.matchId] = { h: r.homeGoals, a: r.awayGoals };
      });
      setScores(final);
      setMinute(90);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }

    let m = 0;
    let idx = 0;
    const id = setInterval(() => {
      m += 2; // ~3s for full 90
      if (m > 90) m = 90;
      setMinute(m);
      while (idx < timeline.length && timeline[idx]!.minute <= m) {
        const ev = timeline[idx]!;
        setScores((prev) => {
          const cur = prev[ev.matchId] ?? { h: 0, a: 0 };
          const next = {
            ...prev,
            [ev.matchId]: {
              h: cur.h + (ev.side === "home" ? 1 : 0),
              a: cur.a + (ev.side === "away" ? 1 : 0),
            },
          };
          return next;
        });
        const match = byId[ev.matchId];
        const team =
          ev.side === "home" ? match?.home ?? "Home" : match?.away ?? "Away";
        setLastGoal(`⚽ ${team} · ${ev.minute}'`);
        sfxGoal();
        idx++;
      }
      if (m >= 90) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }
    }, 70);
    return () => clearInterval(id);
  }, [timeline, byId, results, skip, onDone]);

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-ink-muted/15 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-ink">Live · {minute}&apos;</p>
        {lastGoal && (
          <p className="text-[11px] font-semibold text-brand">{lastGoal}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {results.map((r) => {
          const m = byId[r.matchId];
          const sc = scores[r.matchId] ?? { h: 0, a: 0 };
          return (
            <div
              key={r.matchId}
              className="flex items-center justify-between rounded-xl bg-bg px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-semibold">
                {m?.home ?? "Home"}
              </span>
              <span className="mx-2 shrink-0 font-display text-base font-extrabold tabular-nums">
                {sc.h} - {sc.a}
              </span>
              <span className="min-w-0 flex-1 truncate text-right font-semibold">
                {m?.away ?? "Away"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function VirtualPage() {
  const { user } = useAuth();
  const [league, setLeague] = useState(VIRTUAL_LEAGUES[0]!.id);
  const [round, setRound] = useState<VirtualRoundPublic | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [picks, setPicks] = useState<PickLeg[]>([]);
  const [stake, setStake] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);
  const [ticketMsg, setTicketMsg] = useState<string | null>(null);
  const [settleInfo, setSettleInfo] = useState<{
    results: VirtualMatchResult[];
    summary: string;
  } | null>(null);
  const [animDone, setAnimDone] = useState(false);
  const [skipAnim, setSkipAnim] = useState(false);
  const settledRoundRef = useRef<string | null>(null);

  const token = useCallback(async () => {
    if (!user) throw new Error("Sign in required");
    return user.getIdToken();
  }, [user]);

  /** quiet = phase poll (no full-page busy spinner) */
  const loadRound = useCallback(
    async (quiet = false) => {
      if (!user) return;
      if (!quiet) {
        setBusy(true);
        setErr(null);
      }
      try {
        const t = await token();
        const res = await fetch("/api/virtual/round", {
          headers: { Authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setRound(data.round);
        if (typeof data.round?.serverNow === "number") {
          offsetRef.current = data.round.serverNow - Date.now();
        }
        if (typeof data.balance === "number") setBalance(data.balance);
      } catch (e) {
        if (!quiet) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [user, token]
  );

  useEffect(() => {
    if (user) void loadRound(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local clock only — no network
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => clearInterval(id);
  }, []);

  // Quiet refresh when phase boundaries pass (1 HTTP call, not Firestore onSnapshot)
  useEffect(() => {
    if (!round || round.endsAt === undefined || round.kickoffAt === undefined)
      return;
    if (now >= round.endsAt || (round.phase === "betting" && now >= round.kickoffAt)) {
      void loadRound(true);
    }
  }, [now, round?.endsAt, round?.kickoffAt, round?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset animation when round changes
  useEffect(() => {
    setAnimDone(false);
    setSkipAnim(false);
    setSettleInfo(null);
  }, [round?.id]);

  // Auto-settle once per round when live/result (one POST, transactional on server)
  useEffect(() => {
    if (!user || !round) return;
    if (round.phase === "betting") return;
    if (settledRoundRef.current === round.id) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await token();
        const res = await fetch("/api/virtual/settle", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roundId: round.id }),
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        settledRoundRef.current = round.id;
        if (typeof data.balance === "number") setBalance(data.balance);
        if (data.results) {
          const settled = (data.settled || []) as Array<{
            status: string;
            profit: number;
          }>;
          let summary = "";
          if (settled.length) {
            const won = settled.filter((s) => s.status === "won");
            const profit = settled.reduce((a, s) => a + (s.profit || 0), 0);
            summary =
              won.length > 0
                ? `Settled · +${chips(Math.max(0, profit))}`
                : `Settled · ${chips(profit)}`;
            if (won.length > 0) sfxWin();
            else sfxLose();
          }
          setSettleInfo({ results: data.results, summary });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, round?.id, round?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const all = round?.matches ?? [];
    return all.filter((m) => m.league === league);
  }, [round, league]);

  const totalOdds = useMemo(
    () =>
      picks.length === 0
        ? 1
        : Math.round(picks.reduce((a, p) => a * p.odds, 1) * 100) / 100,
    [picks]
  );
  const stakeNum = Number(stake) || 0;
  const potential = Math.floor(stakeNum * totalOdds * 100) / 100;

  const msLeft =
    round == null
      ? 0
      : round.phase === "betting"
        ? Math.max(0, (round.kickoffAt ?? now) - now)
        : Math.max(0, (round.endsAt ?? now) - now);

  function togglePick(
    m: VirtualMatchPublic,
    leg: Omit<PickLeg, "home" | "away">
  ) {
    if (round?.phase !== "betting") return;
    setPicks((prev) => {
      const without = prev.filter((p) => p.matchId !== m.id);
      const same = prev.find(
        (p) =>
          p.matchId === m.id && p.market === leg.market && p.pick === leg.pick
      );
      if (same) return without;
      return [
        ...without,
        { ...leg, matchId: m.id, home: m.home, away: m.away },
      ];
    });
  }

  function isSelected(matchId: string, market: string, pick: string) {
    return picks.some(
      (p) => p.matchId === matchId && p.market === market && p.pick === pick
    );
  }

  async function placeBet() {
    if (!user || !round || busy) return;
    if (round.phase !== "betting") {
      setErr("Betting closed");
      return;
    }
    if (picks.length === 0) {
      setErr("Pick at least one market");
      return;
    }
    if (stakeNum < CASINO_MIN_STAKE || stakeNum > CASINO_MAX_STAKE) {
      setErr(`Stake ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE}`);
      return;
    }
    setBusy(true);
    setErr(null);
    setTicketMsg(null);
    try {
      const t = await token();
      const res = await fetch("/api/virtual/bet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stake: stakeNum,
          legs: picks.map((p) => ({
            matchId: p.matchId,
            market: p.market,
            pick: p.pick,
            odds: p.odds,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bet failed");
      if (typeof data.balance === "number") setBalance(data.balance);
      setTicketMsg(
        `Bet placed · potential ${chips(data.potential)} · watch for kick-off`
      );
      setPicks([]);
      sfxBet();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-bold">Instant Football</p>
        <p className="mt-2 text-sm text-ink-muted">Sign in to play for free.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const showAnim =
    (round?.phase === "live" || round?.phase === "result") &&
    (round.results?.length ?? 0) > 0 &&
    !animDone;
  const showFinal =
    animDone ||
    (round?.phase === "result" && skipAnim) ||
    (round?.phase === "result" && animDone);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg pb-48 text-ink">
      <header className="sticky top-0 z-20 border-b border-ink-muted/10 bg-brand px-3 py-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <Link href="/casino" className="text-sm font-semibold opacity-95">
            ← Instant Football
          </Link>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tabular-nums">
            {balance == null ? "…" : chips(balance)} chips
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="font-semibold">
            Round #{round?.index ?? "—"} ·{" "}
            {round?.phase === "betting"
              ? "Betting open"
              : round?.phase === "live"
                ? "Live"
                : "Result"}
          </span>
          <span className="tabular-nums opacity-90">
            {round?.phase === "betting"
              ? `Kick-off ${fmtMs(msLeft)}`
              : `Next ${fmtMs(msLeft)}`}
          </span>
        </div>
        <Link
          href="/virtual/fair"
          className="mt-1 inline-block text-[10px] font-semibold underline opacity-80"
        >
          Provably fair
        </Link>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-muted/10 px-2 py-2">
        {VIRTUAL_LEAGUES.map((lg) => (
          <button
            key={lg.id}
            type="button"
            onClick={() => setLeague(lg.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              league === lg.id
                ? "bg-brand text-white"
                : "bg-ink-muted/10 text-ink-muted"
            }`}
          >
            {lg.label}
          </button>
        ))}
      </div>

      {ticketMsg && (
        <p className="mx-3 mt-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-800">
          {ticketMsg}
        </p>
      )}
      {settleInfo?.summary && (
        <p className="mx-3 mt-2 rounded-xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
          {settleInfo.summary}
        </p>
      )}
      {err && (
        <p className="mx-3 mt-2 text-center text-xs font-medium text-red-600">
          {err}
        </p>
      )}

      {/* Goal-by-goal animation during live */}
      {showAnim && round?.results && (
        <>
          <GoalAnimation
            matches={round.matches}
            results={round.results}
            skip={skipAnim}
            onDone={() => setAnimDone(true)}
          />
          {!skipAnim && !animDone && (
            <div className="mx-3 mt-2">
              <button
                type="button"
                onClick={() => setSkipAnim(true)}
                className="w-full rounded-xl border border-ink-muted/20 bg-surface py-2.5 text-sm font-bold text-ink"
              >
                Skip to result
              </button>
            </div>
          )}
        </>
      )}

      {/* Final scores after animation or on result phase */}
      {(animDone || (round?.phase === "result" && round.results)) &&
        round?.results && (
          <div className="mx-3 mt-3 rounded-2xl border border-ink-muted/15 bg-surface p-3">
            <p className="mb-2 text-xs font-bold uppercase text-ink-muted">
              Full time
            </p>
            <div className="flex flex-col gap-2">
              {round.results
                .filter((r) => {
                  const m = round.matches.find((x) => x.id === r.matchId);
                  return m?.league === league;
                })
                .map((r) => {
                  const m = round.matches.find((x) => x.id === r.matchId);
                  return (
                    <div
                      key={r.matchId}
                      className="flex items-center justify-between rounded-xl bg-bg px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {m?.home ?? "Home"}
                      </span>
                      <span className="mx-2 shrink-0 font-display text-base font-extrabold tabular-nums">
                        {r.homeGoals} - {r.awayGoals}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right font-semibold">
                        {m?.away ?? "Away"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      {/* Markets — betting open */}
      {round?.phase === "betting" && (
        <div className="mt-2 flex flex-col gap-1 px-2">
          {matches.map((m) => {
            const open = expanded === m.id;
            const locked = round?.phase !== "betting";
            const sel = picks.find((p) => p.matchId === m.id);
            return (
              <div
                key={m.id}
                className="overflow-hidden rounded-2xl border border-ink-muted/10 bg-surface"
              >
                <div className="flex">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((e) => (e === m.id ? null : m.id))
                    }
                    className="min-w-0 flex-1 px-3 py-2.5 text-left"
                  >
                    <p className="truncate text-sm font-bold">
                      {m.home}{" "}
                      <span className="font-normal text-ink-muted">vs</span>{" "}
                      {m.away}
                    </p>
                    {sel && (
                      <p className="mt-0.5 text-[11px] font-semibold text-brand">
                        {sel.label} @{sel.odds.toFixed(2)}
                      </p>
                    )}
                  </button>
                  {(
                    [
                      ["home", m.odds1x2.home],
                      ["draw", m.odds1x2.draw],
                      ["away", m.odds1x2.away],
                    ] as const
                  ).map(([pk, od]) => {
                    const on = isSelected(m.id, "1x2", pk);
                    return (
                      <button
                        key={pk}
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          togglePick(m, {
                            matchId: m.id,
                            market: "1x2",
                            pick: pk,
                            odds: od,
                            label: pickLabel("1x2", pk),
                          })
                        }
                        className={`w-[4.5rem] border-l border-ink-muted/10 text-sm font-bold tabular-nums disabled:opacity-50 ${
                          on
                            ? "bg-brand text-white"
                            : "bg-emerald-500/5 text-ink"
                        }`}
                      >
                        {od.toFixed(2)}
                      </button>
                    );
                  })}
                </div>
                {open && (
                  <div className="grid grid-cols-2 gap-2 border-t border-ink-muted/10 bg-bg/40 p-2">
                    {(
                      [
                        ["ou25", "over", m.oddsOu25.over],
                        ["ou25", "under", m.oddsOu25.under],
                        ["btts", "yes", m.oddsBtts.yes],
                        ["btts", "no", m.oddsBtts.no],
                      ] as const
                    ).map(([market, pick, odds]) => {
                      const on = isSelected(m.id, market, pick);
                      return (
                        <button
                          key={`${market}-${pick}`}
                          type="button"
                          disabled={locked}
                          onClick={() =>
                            togglePick(m, {
                              matchId: m.id,
                              market,
                              pick,
                              odds,
                              label: pickLabel(market, pick),
                            })
                          }
                          className={`rounded-xl px-2 py-2 text-[11px] font-bold disabled:opacity-50 ${
                            on
                              ? "bg-brand text-white"
                              : "bg-ink-muted/10 text-ink"
                          }`}
                        >
                          {pickLabel(market, pick)} · {odds.toFixed(2)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {round?.phase === "betting" && (
        <div
          className="fixed inset-x-0 z-40 border-t border-ink-muted/15 bg-surface/95 px-2 pt-2 backdrop-blur"
          style={{
            bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "0.5rem",
          }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={CASINO_MIN_STAKE}
              max={CASINO_MAX_STAKE}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="Stake"
              aria-label="Stake amount"
              className="w-24 rounded-xl border border-ink-muted/20 bg-bg px-2 py-2.5 text-center text-sm font-bold tabular-nums outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={busy || picks.length === 0}
              onClick={() => void placeBet()}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {picks.length === 0
                ? "Pick markets"
                : `Place · ${chips(potential)}`}
            </button>
          </div>
          {picks.length > 0 && (
            <p className="mx-auto mt-1 max-w-lg px-1 text-[10px] text-ink-muted">
              {picks.length} pick{picks.length > 1 ? "s" : ""} · @
              {totalOdds.toFixed(2)}
            </p>
          )}
        </div>
      )}

      {round == null && busy && (
        <p className="mt-10 text-center text-sm text-ink-muted">Loading…</p>
      )}
    </main>
  );
    }
