"use client";

/**
 * Instant Virtual Football — demo chips.
 * Flow: pick → review → Kick Off → quick-game sim → result.
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
  odds: number;
  label: string;
};

type ResolvedLeg = {
  matchId: string;
  home: string;
  away: string;
  market: string;
  pick: string;
  odds: number;
  homeGoals: number;
  awayGoals: number;
  won: boolean;
};

type PlayResult = {
  allWon: boolean;
  payout: number;
  profit: number;
  combinedOdds: number;
  legs: ResolvedLeg[];
  balance: number;
};

type SimScore = { home: number; away: number; minute: number; done: boolean };

function chips(n: number) {
  return n.toLocaleString("en-NG");
}

function short(name: string) {
  const parts = name.replace(/'/g, "").split(/\s+/);
  if (parts.length === 1) return name.slice(0, 3).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 2)).toUpperCase();
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

  // UX phases
  const [phase, setPhase] = useState<"board" | "review" | "sim" | "result">(
    "board"
  );
  const [result, setResult] = useState<PlayResult | null>(null);
  const [simScores, setSimScores] = useState<Record<string, SimScore>>({});
  const [simSkip, setSimSkip] = useState(false);

  const token = useCallback(async () => {
    if (!user) throw new Error("Sign in required");
    return user.getIdToken();
  }, [user]);

  const loadRound = useCallback(
    async (_lg?: string) => {
      if (!user) return;
      setBusy(true);
      setErr(null);
      try {
        const t = await token();
        const res = await fetch("/api/virtual/round", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load board");
        setRound(data.round);
        if (typeof data.balance === "number") setBalance(data.balance);
        setPicks([]);
        setExpanded(null);
        setPhase("board");
        setResult(null);
        setSimScores({});
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(false);
      }
    },
    [user, token]
  );

  useEffect(() => {
    if (user) void loadRound();
    // only on mount / user change — league is client filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  function togglePick(m: VirtualMatchPublic, leg: Omit<PickLeg, "home" | "away">) {
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

  function openReview() {
    setErr(null);
    if (picks.length === 0) {
      setErr("Pick at least one market");
      return;
    }
    const s = Number(stake);
    if (!Number.isFinite(s) || s < CASINO_MIN_STAKE) {
      setErr(`Min stake ${CASINO_MIN_STAKE}`);
      return;
    }
    if (s > CASINO_MAX_STAKE) {
      setErr(`Max stake ${CASINO_MAX_STAKE}`);
      return;
    }
    if (balance != null && s > balance) {
      setErr("Not enough demo chips");
      return;
    }
    setPhase("review");
  }

  async function kickOff() {
    if (!round || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await token();
      const res = await fetch("/api/virtual/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roundId: round.id,
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
      if (!res.ok) throw new Error(data.error || "Play failed");

      const pr: PlayResult = {
        allWon: !!data.allWon,
        payout: Number(data.payout) || 0,
        profit: Number(data.profit) || 0,
        combinedOdds: Number(data.combinedOdds) || 1,
        legs: data.legs || [],
        balance: Number(data.balance) || 0,
      };

      // Seed sim at 0-0 for selected matches (+ fill others from result)
      const seed: Record<string, SimScore> = {};
      for (const leg of pr.legs) {
        seed[leg.matchId] = { home: 0, away: 0, minute: 0, done: false };
      }
      setSimScores(seed);
      setResult(pr);
      setBalance(pr.balance);
      setPhase("sim");
      setSimSkip(false);
      setPicks([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setPhase("review");
    } finally {
      setBusy(false);
    }
  }

  // Animate scores 0-0 → final over ~5s (or instant on skip)
  useEffect(() => {
    if (phase !== "sim" || !result) return;

    if (simSkip) {
      const final: Record<string, SimScore> = {};
      for (const leg of result.legs) {
        final[leg.matchId] = {
          home: leg.homeGoals,
          away: leg.awayGoals,
          minute: 90,
          done: true,
        };
      }
      setSimScores(final);
      const t = setTimeout(() => setPhase("result"), 400);
      return () => clearTimeout(t);
    }

    const targets = result.legs.map((l) => ({
      id: l.matchId,
      h: l.homeGoals,
      a: l.awayGoals,
    }));
    const duration = 5200;
    const start = Date.now();
    let raf = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      // ease
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const minute = Math.floor(e * 90);
      const next: Record<string, SimScore> = {};
      for (const m of targets) {
        const homeFinal =
          m.h === 0 ? 0 : Math.min(m.h, Math.floor(e * m.h + (e > 0.3 ? 0.2 : 0)));
        const awayFinal =
          m.a === 0 ? 0 : Math.min(m.a, Math.floor(e * m.a + (e > 0.35 ? 0.2 : 0)));
        next[m.id] = {
          home: homeFinal,
          away: awayFinal,
          minute,
          done: t >= 1,
        };
      }
      setSimScores(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setPhase("result"), 500);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result, simSkip]);

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

  const primaryLeg = result?.legs[0];
  const primarySim = primaryLeg ? simScores[primaryLeg.matchId] : null;

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg pb-48 text-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-ink-muted/10 bg-brand px-3 py-3 text-white">
        <Link
          href="/casino"
          className="flex items-center gap-1 text-sm font-semibold opacity-95"
        >
          <span aria-hidden>←</span> Instant Football
        </Link>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tabular-nums">
          {balance == null ? "…" : chips(balance)} chips
        </span>
      </header>

      {/* League tabs — board only */}
      {phase === "board" && (
        <div className="flex gap-1 overflow-x-auto border-b border-ink-muted/10 px-2 py-2 scrollbar-none">
          {VIRTUAL_LEAGUES.map((lg) => (
            <button
              key={lg.id}
              type="button"
              onClick={() => setLeague(lg.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                league === lg.id
                  ? "bg-brand text-white"
                  : "bg-ink-muted/10 text-ink-muted"
              }`}
            >
              {lg.label}
            </button>
          ))}
        </div>
      )}

      {err && phase === "board" && (
        <p className="mx-3 mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-center text-xs font-semibold text-red-600">
          {err}
        </p>
      )}

      {/* ===== BOARD ===== */}
      {phase === "board" && (
        <div className="px-2 pt-2">
          <div className="mb-1 flex items-center px-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            <span className="flex-1">Match</span>
            <span className="w-[4.5rem] text-center">1</span>
            <span className="w-[4.5rem] text-center">X</span>
            <span className="w-[4.5rem] text-center">2</span>
          </div>

          {busy && matches.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-muted">
              Loading board…
            </p>
          )}

          <div className="flex flex-col gap-2">
            {matches.map((m) => {
              const open = expanded === m.id;
              const sel = picks.find((p) => p.matchId === m.id);
              return (
                <div
                  key={m.id}
                  className="overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface"
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : m.id)}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <p className="truncate text-sm font-bold leading-tight">
                        {m.home}{" "}
                        <span className="font-normal text-ink-muted">vs</span>{" "}
                        {m.away}
                      </p>
                      {sel && (
                        <p className="mt-0.5 text-[11px] font-semibold text-brand">
                          {sel.label} @ {sel.odds.toFixed(2)}
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
                              label:
                                pk === "home"
                                  ? "Home"
                                  : pk === "draw"
                                    ? "Draw"
                                    : "Away",
                            })
                          }
                          className={`w-[4.5rem] border-l border-ink-muted/10 text-sm font-bold tabular-nums ${
                            on
                              ? "bg-brand text-white"
                              : "bg-emerald-500/5 text-ink active:bg-emerald-500/15"
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
                          ["ou25", "over", `Over 2.5 · ${m.oddsOu25.over.toFixed(2)}`, m.oddsOu25.over],
                          ["ou25", "under", `Under 2.5 · ${m.oddsOu25.under.toFixed(2)}`, m.oddsOu25.under],
                          ["btts", "yes", `BTTS Yes · ${m.oddsBtts.yes.toFixed(2)}`, m.oddsBtts.yes],
                          ["btts", "no", `BTTS No · ${m.oddsBtts.no.toFixed(2)}`, m.oddsBtts.no],
                        ] as const
                      ).map(([market, pick, label, odds]) => {
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
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== REVIEW SHEET ===== */}
      {phase === "review" && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg">
          <header className="flex items-center justify-between border-b border-ink-muted/10 bg-surface px-3 py-3">
            <button
              type="button"
              onClick={() => setPhase("board")}
              className="text-sm font-semibold text-ink-muted"
            >
              ← Back
            </button>
            <p className="text-sm font-bold">Betslip</p>
            <span className="w-10" />
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
              {picks.length > 1 ? "Multiple" : "Single"} · {picks.length} pick
              {picks.length === 1 ? "" : "s"}
            </p>
            <div className="overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface">
              {picks.map((p, i) => (
                <div
                  key={`${p.matchId}-${p.market}`}
                  className={`px-4 py-3 ${i > 0 ? "border-t border-ink-muted/10" : ""}`}
                >
                  <p className="text-sm font-bold">
                    {p.label}{" "}
                    <span className="text-brand">@{p.odds.toFixed(2)}</span>
                  </p>
                  <p className="text-[11px] font-semibold uppercase text-ink-muted">
                    {p.market === "1x2"
                      ? "1X2"
                      : p.market === "ou25"
                        ? "O/U"
                        : "BTTS"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {p.home} vs {p.away}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-ink-muted/10 bg-bg/50 px-4 py-3 text-sm">
                <span className="text-ink-muted">
                  Stake{" "}
                  <span className="font-bold text-ink tabular-nums">
                    {chips(stakeNum)}
                  </span>
                </span>
                <span className="text-ink-muted">
                  Pot. Win{" "}
                  <span className="font-bold text-brand tabular-nums">
                    {chips(potential)}
                  </span>
                </span>
              </div>
            </div>
            {err && (
              <p className="mt-3 text-center text-xs font-semibold text-red-600">
                {err}
              </p>
            )}
          </div>

          <div
            className="grid grid-cols-2 gap-0 border-t border-ink-muted/15"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <button
              type="button"
              onClick={() => setPhase("board")}
              className="bg-ink-muted/10 py-4 text-sm font-bold text-ink"
            >
              Keep Betting
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void kickOff()}
              className="bg-brand py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "…" : "Kick Off"}
            </button>
          </div>
        </div>
      )}

       {/* ===== SIMULATION ===== */}
      {(phase === "sim" || phase === "result") && result && (
        <div className="flex flex-col">
          {/* Pitch */}
          <div className="relative mx-2 mt-3 overflow-hidden rounded-2xl bg-emerald-700">
            <div
              className="relative h-36 w-full"
              style={{
                background:
                  "repeating-linear-gradient(90deg,#15803d 0 12%,#166534 12% 24%)",
              }}
            >
              {/* pitch lines */}
              <div className="pointer-events-none absolute inset-2 rounded border border-white/40">
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/40" />
                <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
              </div>
              {/* floating dots */}
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full opacity-80"
                  style={{
                    background: i % 2 === 0 ? "#f87171" : "#60a5fa",
                    left: `${8 + ((i * 17) % 84)}%`,
                    top: `${12 + ((i * 23) % 70)}%`,
                  }}
                />
              ))}
              {/* scoreboard */}
              {primaryLeg && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-black/75 px-3 py-3 text-center text-white shadow-lg">
                  <div className="flex items-center justify-center gap-3 text-xs font-bold">
                    <span className="max-w-[5rem] truncate text-red-300">
                      {short(primaryLeg.home)}
                    </span>
                    <span className="text-2xl font-extrabold tabular-nums tracking-wider">
                      {primarySim?.home ?? 0} - {primarySim?.away ?? 0}
                    </span>
                    <span className="max-w-[5rem] truncate text-blue-300">
                      {short(primaryLeg.away)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                    {phase === "result" || primarySim?.done
                      ? "FINAL TIME"
                      : `${String(primarySim?.minute ?? 0).padStart(2, "0")}:00`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* My Events */}
          <div className="mt-4 px-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-muted">
              <span aria-hidden>⚽</span> My Events
            </p>
            <div className="flex flex-col gap-2">
              {result.legs.map((leg) => {
                const sc = simScores[leg.matchId];
                const h = sc?.home ?? 0;
                const a = sc?.away ?? 0;
                const finished = phase === "result" || sc?.done;
                return (
                  <div
                    key={leg.matchId}
                    className="rounded-2xl border border-ink-muted/12 bg-surface px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="w-14 truncate text-right text-xs font-bold">
                        {short(leg.home)}
                      </span>
                      <span className="text-lg font-extrabold tabular-nums">
                        {h} - {a}
                      </span>
                      <span className="w-14 truncate text-xs font-bold">
                        {short(leg.away)}
                      </span>
                    </div>
                    {finished && (
                      <div className="mt-2 flex items-center justify-between border-t border-ink-muted/10 pt-2 text-[11px]">
                        <span
                          className={
                            leg.won
                              ? "font-bold text-emerald-600"
                              : "font-bold text-red-500"
                          }
                        >
                          {leg.won ? "Won" : "Lost"} · {pickLabel(leg.market, leg.pick)} @
                          {leg.odds.toFixed(2)}
                        </span>
                        <span className="text-ink-muted">
                          {leg.market === "1x2"
                            ? "1X2"
                            : leg.market === "ou25"
                              ? "O/U"
                              : "BTTS"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result banner after sim */}
          {phase === "result" && (
            <div
              className={`mx-3 mt-4 rounded-2xl border px-4 py-3 text-center ${
                result.allWon
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-red-500/30 bg-red-500/10"
              }`}
            >
              <p
                className={`text-base font-extrabold ${
                  result.allWon ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {result.allWon
                  ? `Won +${chips(result.profit)}`
                  : `Lost −${chips(Math.abs(result.profit))}`}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                @{result.combinedOdds.toFixed(2)} · stake {chips(stakeNum)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== FOOTER ===== */}
      {phase === "board" && (
        <div
          className="fixed inset-x-0 z-40 border-t border-ink-muted/15 bg-surface/95 px-2 pt-2 backdrop-blur"
          style={{
            bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "0.5rem",
          }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadRound()}
              className="rounded-xl border border-ink-muted/20 px-3 py-2.5 text-xs font-bold text-ink-muted disabled:opacity-40"
            >
              Next round
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={CASINO_MIN_STAKE}
              max={CASINO_MAX_STAKE}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-20 rounded-xl border border-ink-muted/20 bg-bg px-2 py-2.5 text-center text-sm font-bold tabular-nums outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={busy || picks.length === 0}
              onClick={openReview}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {picks.length === 0
                ? "Betslip"
                : `Kick Off · ${chips(potential)}`}
            </button>
          </div>
          {picks.length > 0 && (
            <p className="mx-auto mt-1 max-w-lg px-1 text-[10px] text-ink-muted">
              {picks.length} pick{picks.length > 1 ? "s" : ""} · @{totalOdds.toFixed(2)}{" "}
              <button
                type="button"
                onClick={() => setPicks([])}
                className="ml-1 font-semibold text-red-500"
              >
                Clear
              </button>
            </p>
          )}
        </div>
      )}

      {phase === "sim" && (
        <div
          className="fixed inset-x-0 z-40"
          style={{
            bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            onClick={() => setSimSkip(true)}
            className="w-full bg-brand py-3.5 text-sm font-bold text-white"
          >
            Skip to Result
          </button>
        </div>
      )}

      {phase === "result" && result && (
        <div
          className="fixed inset-x-0 z-40 grid grid-cols-2"
          style={{
            bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setPhase("board");
              setResult(null);
            }}
            className="bg-ink-muted/15 py-3.5 text-sm font-bold text-ink"
          >
            Ticket Details
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadRound()}
            className="bg-brand py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Next Round
            <span className="mt-0.5 block text-[10px] font-semibold opacity-90">
              {result.allWon
                ? `Total Won: ${chips(result.payout)}`
                : `Total Won: 0`}
            </span>
          </button>
        </div>
      )}
    </main>
  );
}
