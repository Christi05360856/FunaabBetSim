"use client";

/**
 * Instant Virtual Football — Sporty-style flow:
 * pick → place → Kick Off (user starts) → goal animation → result → Next Round
 * Shared fixtures still rotate on a clock; Kick Off does NOT wait for that clock.
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
import {
  bindGlobalAudioUnlock,
  sfxBet,
  sfxGoal,
  sfxLose,
  sfxWin,
  unlockAudio,
} from "@/lib/casino/sounds";

type PickLeg = {
  matchId: string;
  home: string;
  away: string;
  market: "1x2" | "ou25" | "btts";
  pick: string;
  odds: number;
  label: string;
};

type Flow = "browse" | "ticket" | "playing" | "done";

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

function GoalAnimation({
  matches,
  results,
  myMatchIds,
  onDone,
  skip,
}: {
  matches: VirtualMatchPublic[];
  results: VirtualMatchResult[];
  myMatchIds: Set<string>;
  onDone: () => void;
  skip: boolean;
}) {
  const [minute, setMinute] = useState(0);
  const [scores, setScores] = useState<Record<string, { h: number; a: number }>>(
    {}
  );
  const [lastGoal, setLastGoal] = useState<string | null>(null);
  const [headline, setHeadline] = useState<{
    home: string;
    away: string;
    h: number;
    a: number;
  } | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const byId = useMemo(() => {
    const m: Record<string, VirtualMatchPublic> = {};
    matches.forEach((x) => {
      m[x.id] = x;
    });
    return m;
  }, [matches]);

  const finals = useMemo(() => {
    const f: Record<string, { h: number; a: number }> = {};
    results.forEach((r) => {
      f[r.matchId] = {
        h: Math.min(6, Math.max(0, r.homeGoals)),
        a: Math.min(6, Math.max(0, r.awayGoals)),
      };
    });
    return f;
  }, [results]);

  const timeline = useMemo(() => {
    const events: Array<{
      minute: number;
      matchId: string;
      side: "home" | "away";
    }> = [];
    results.forEach((r) => {
      const capH = finals[r.matchId]?.h ?? 0;
      const capA = finals[r.matchId]?.a ?? 0;
      let h = 0;
      let a = 0;
      const sorted = [...(r.goals || [])].sort((x, y) => x.minute - y.minute);
      for (const g of sorted) {
        if (g.side === "home") {
          if (h >= capH) continue;
          h += 1;
        } else {
          if (a >= capA) continue;
          a += 1;
        }
        events.push({
          minute: Math.min(90, Math.max(1, g.minute)),
          matchId: r.matchId,
          side: g.side,
        });
      }
    });
    events.sort((a, b) => a.minute - b.minute);
    return events;
  }, [results, finals]);

  useEffect(() => {
    doneRef.current = false;
    const init: Record<string, { h: number; a: number }> = {};
    results.forEach((r) => {
      init[r.matchId] = { h: 0, a: 0 };
    });
    setScores(init);
    setMinute(0);
    setLastGoal(null);

    const firstMy = results.find((r) => myMatchIds.has(r.matchId));
    if (firstMy) {
      const m = byId[firstMy.matchId];
      if (m) setHeadline({ home: m.home, away: m.away, h: 0, a: 0 });
    }

    if (skip) {
      setScores({ ...finals });
      setMinute(90);
      if (firstMy) {
        const m = byId[firstMy.matchId];
        const f = finals[firstMy.matchId];
        if (m && f)
          setHeadline({ home: m.home, away: m.away, h: f.h, a: f.a });
      }
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
      return;
    }

    let m = 0;
    let idx = 0;
    const running: Record<string, { h: number; a: number }> = {};
    results.forEach((r) => {
      running[r.matchId] = { h: 0, a: 0 };
    });

    const id = setInterval(() => {
      m = Math.min(90, m + 3);
      setMinute(m);
      let scored = false;
      while (idx < timeline.length && timeline[idx]!.minute <= m) {
        const ev = timeline[idx]!;
        const cur = running[ev.matchId] ?? { h: 0, a: 0 };
        const cap = finals[ev.matchId] ?? { h: 0, a: 0 };
        if (ev.side === "home" && cur.h < cap.h) {
          cur.h += 1;
          scored = true;
          const match = byId[ev.matchId];
          setLastGoal(`⚽ ${match?.home ?? "Home"} · ${ev.minute}'`);
          if (myMatchIds.has(ev.matchId) && match) {
            setHeadline({
              home: match.home,
              away: match.away,
              h: cur.h,
              a: cur.a,
            });
          }
          sfxGoal();
        } else if (ev.side === "away" && cur.a < cap.a) {
          cur.a += 1;
          scored = true;
          const match = byId[ev.matchId];
          setLastGoal(`⚽ ${match?.away ?? "Away"} · ${ev.minute}'`);
          if (myMatchIds.has(ev.matchId) && match) {
            setHeadline({
              home: match.home,
              away: match.away,
              h: cur.h,
              a: cur.a,
            });
          }
          sfxGoal();
        }
        running[ev.matchId] = { ...cur };
        idx += 1;
      }
      if (scored) setScores({ ...running });
      if (m >= 90) {
        clearInterval(id);
        setScores({ ...finals });
        if (!doneRef.current) {
          doneRef.current = true;
          onDoneRef.current();
        }
      }
    }, 80);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, skip, timeline, finals, byId]);

  const myResults = results.filter((r) => myMatchIds.has(r.matchId));
  const otherResults = results.filter((r) => !myMatchIds.has(r.matchId));

  return (
    <div className="mx-3 mt-3 flex flex-col gap-3">
      {/* Pitch-style scoreboard */}
      <div className="relative overflow-hidden rounded-2xl bg-emerald-800 px-4 py-6 text-center text-white">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute left-1/2 top-0 h-full w-px bg-white" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white" />
        </div>
        {headline ? (
          <>
            <p className="relative text-xs font-semibold opacity-80">
              {minute >= 90 ? "FULL TIME" : `LIVE · ${minute}'`}
            </p>
            <div className="relative mt-2 flex items-center justify-center gap-4">
              <span className="max-w-[35%] truncate text-sm font-bold">
                {headline.home}
              </span>
              <span className="font-display text-3xl font-extrabold tabular-nums">
                {headline.h} - {headline.a}
              </span>
              <span className="max-w-[35%] truncate text-sm font-bold">
                {headline.away}
              </span>
            </div>
          </>
        ) : (
          <p className="relative text-sm font-bold">
            {minute >= 90 ? "Full time" : `Live · ${minute}'`}
          </p>
        )}
        {lastGoal && (
          <p className="relative mt-2 text-[11px] font-semibold text-emerald-200">
            {lastGoal}
          </p>
        )}
      </div>

      {myResults.length > 0 && (
        <div>
          <p className="mb-1.5 px-1 text-[11px] font-bold uppercase text-ink-muted">
            My events
          </p>
          <div className="flex flex-col gap-1.5">
            {myResults.map((r) => {
              const m = byId[r.matchId];
              const sc = scores[r.matchId] ?? { h: 0, a: 0 };
              return (
                <div
                  key={r.matchId}
                  className="flex items-center justify-between rounded-xl border border-brand/30 bg-surface px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {m?.home}
                  </span>
                  <span className="mx-2 font-display text-base font-extrabold tabular-nums">
                    {sc.h} - {sc.a}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right font-semibold">
                    {m?.away}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {otherResults.length > 0 && (
        <div>
          <p className="mb-1.5 px-1 text-[11px] font-bold uppercase text-ink-muted">
            League
          </p>
          <div className="flex flex-col gap-1.5">
            {otherResults.map((r) => {
              const m = byId[r.matchId];
              const sc = scores[r.matchId] ?? { h: 0, a: 0 };
              return (
                <div
                  key={r.matchId}
                  className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m?.home}
                  </span>
                  <span className="mx-2 font-display font-bold tabular-nums">
                    {sc.h} - {sc.a}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right font-medium">
                    {m?.away}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const [flow, setFlow] = useState<Flow>("browse");
  const [ticketMeta, setTicketMeta] = useState<{
    potential: number;
    stake: number;
    legs: PickLeg[];
  } | null>(null);
  const [playResults, setPlayResults] = useState<VirtualMatchResult[] | null>(
    null
  );
  const [settleSummary, setSettleSummary] = useState<string | null>(null);
  const [skipAnim, setSkipAnim] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const lastRoundId = useRef<string | null>(null);

  const token = useCallback(async () => {
    if (!user) throw new Error("Sign in required");
    return user.getIdToken();
  }, [user]);

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

  useEffect(() => {
    bindGlobalAudioUnlock();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => clearInterval(id);
  }, []);

  // When shared round id changes → new fixtures (Next Round)
  useEffect(() => {
    if (!round?.id) return;
    if (lastRoundId.current && lastRoundId.current !== round.id) {
      setFlow("browse");
      setTicketMeta(null);
      setPlayResults(null);
      setSettleSummary(null);
      setSkipAnim(false);
      setAnimDone(false);
      setPicks([]);
    }
    lastRoundId.current = round.id;
  }, [round?.id]);

  // Quiet poll near end so Next Round fixtures appear
  useEffect(() => {
    if (!round?.endsAt) return;
    if (now >= round.endsAt) void loadRound(true);
  }, [now, round?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Next Round countdown = time until fixtures rotate
  const msToNext =
    round?.endsAt != null ? Math.max(0, round.endsAt - now) : 0;

  const myMatchIds = useMemo(() => {
    const s = new Set<string>();
    (ticketMeta?.legs ?? []).forEach((l) => s.add(l.matchId));
    return s;
  }, [ticketMeta]);

  function togglePick(
    m: VirtualMatchPublic,
    leg: Omit<PickLeg, "home" | "away">
  ) {
    if (flow === "playing" || flow === "done") return;
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
    if (picks.length === 0) {
      setErr("Pick at least one market");
      return;
    }
    if (stakeNum < CASINO_MIN_STAKE || stakeNum > CASINO_MAX_STAKE) {
      setErr(`Stake ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE}`);
      return;
    }
    unlockAudio();
    setBusy(true);
    setErr(null);
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
      setTicketMeta({
        potential: data.potential ?? potential,
        stake: stakeNum,
        legs: [...picks],
      });
      setPicks([]);
      setFlow("ticket");
      sfxBet();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  /** Sporty Kick Off — play now, no forced wait for shared clock */
  async function kickOff() {
    if (!user || !round || busy) return;
    unlockAudio();
    setBusy(true);
    setErr(null);
    setSkipAnim(false);
    setAnimDone(false);
    try {
      const t = await token();
      const res = await fetch("/api/virtual/settle", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roundId: round.id, kickoff: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kick off failed");
      if (typeof data.balance === "number") setBalance(data.balance);
      setPlayResults(data.results || []);
      const settled = (data.settled || []) as Array<{
        status: string;
        profit: number;
      }>;
      if (settled.length) {
        const won = settled.filter((s) => s.status === "won");
        const profit = settled.reduce((a, s) => a + (s.profit || 0), 0);
        const summary =
          won.length > 0
            ? `Won · +${chips(Math.max(0, profit))}`
            : `Lost · ${chips(profit)}`;
        setSettleSummary(summary);
        if (won.length > 0) sfxWin();
        else sfxLose();
      } else {
        setSettleSummary(null);
      }
      setFlow("playing");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function onAnimDone() {
    setAnimDone(true);
    setFlow("done");
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

  const leagueMatches = matches;
  const leagueResults =
    playResults?.filter((r) => {
      const m = round?.matches.find((x) => x.id === r.matchId);
      return m?.league === league;
    }) ?? [];

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
            Round #{round?.index ?? "—"}
            {flow === "playing" || flow === "done" ? " · Live" : " · Open"}
          </span>
          <span className="tabular-nums opacity-90">
            Next round {fmtMs(msToNext)}
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

      {err && (
        <p className="mx-3 mt-2 text-center text-xs font-medium text-red-600">
          {err}
        </p>
      )}
      {settleSummary && (flow === "playing" || flow === "done") && (
        <p className="mx-3 mt-2 rounded-xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
          {settleSummary}
        </p>
      )}

      {/* PLAYING / DONE — animation + scores */}
      {(flow === "playing" || flow === "done") &&
        playResults &&
        leagueResults.length > 0 && (
          <>
            <GoalAnimation
              matches={leagueMatches}
              results={leagueResults}
              myMatchIds={myMatchIds}
              skip={skipAnim || flow === "done"}
              onDone={onAnimDone}
            />
            {flow === "playing" && !animDone && (
              <div className="mx-3 mt-2">
                <button
                  type="button"
                  onClick={() => setSkipAnim(true)}
                  className="w-full rounded-xl border border-ink-muted/20 bg-surface py-3 text-sm font-bold"
                >
                  Skip to result
                </button>
              </div>
            )}
          </>
        )}

      {/* TICKET review — Keep Betting | Kick Off */}
      {flow === "ticket" && ticketMeta && (
        <div className="mx-3 mt-3 rounded-2xl border border-ink-muted/15 bg-surface p-3">
          <p className="text-xs font-bold uppercase text-ink-muted">
            Your ticket
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {ticketMeta.legs.map((l) => (
              <div
                key={`${l.matchId}-${l.market}-${l.pick}`}
                className="rounded-xl bg-bg px-3 py-2 text-sm"
              >
                <p className="font-semibold">
                  {l.home} vs {l.away}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {l.label} @{l.odds.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-ink-muted">
              Stake {chips(ticketMeta.stake)}
            </span>
            <span className="font-bold text-brand">
              Pot. {chips(ticketMeta.potential)}
            </span>
          </div>
        </div>
      )}

      {/* BROWSE markets */}
      {(flow === "browse" || flow === "ticket") && (
        <div className="mt-2 flex flex-col gap-1 px-2">
          {leagueMatches.map((m) => {
            const open = expanded === m.id;
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
                        onClick={() =>
                          togglePick(m, {
                            matchId: m.id,
                            market: "1x2",
                            pick: pk,
                            odds: od,
                            label: pickLabel("1x2", pk),
                          })
                        }
                        className={`w-[4.5rem] border-l border-ink-muted/10 text-sm font-bold tabular-nums ${
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
                          onClick={() =>
                            togglePick(m, {
                              matchId: m.id,
                              market,
                              pick,
                              odds,
                              label: pickLabel(market, pick),
                            })
                          }
                          className={`rounded-xl px-2 py-2 text-[11px] font-bold ${
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

      {/* Footer actions */}
      <div
        className="fixed inset-x-0 z-40 border-t border-ink-muted/15 bg-surface/95 px-2 pt-2 backdrop-blur"
        style={{
          bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          {flow === "browse" && (
            <>
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
            </>
          )}

          {flow === "ticket" && (
            <>
              <button
                type="button"
                onClick={() => setFlow("browse")}
                className="flex-1 rounded-xl border border-ink-muted/25 py-3 text-sm font-bold"
              >
                Keep betting
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void kickOff()}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "…" : "Kick Off"}
              </button>
            </>
          )}

          {(flow === "playing" || flow === "done") && (
            <button
              type="button"
              onClick={() => void loadRound(false)}
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white"
            >
              Next round
              <span className="mt-0.5 block text-[10px] font-semibold opacity-90">
                {settleSummary ?? `in ${fmtMs(msToNext)}`}
              </span>
            </button>
          )}
        </div>
      </div>

      {round == null && busy && (
        <p className="mt-10 text-center text-sm text-ink-muted">Loading…</p>
      )}
    </main>
  );
      }
