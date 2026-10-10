"use client";

/**
 * Instant Football — fixtures board (Sporty-style dedicated page).
 * Place bet → /virtual/ticket → Kick Off → /virtual/play
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import type { VirtualMatchPublic, VirtualRoundPublic } from "@/types/virtual";
import { VIRTUAL_LEAGUES } from "@/lib/virtual/teamPool";
import { saveTicket, type StoredLeg } from "@/lib/virtual/ticketStore";
import { bindGlobalAudioUnlock, sfxBet, unlockAudio } from "@/lib/casino/sounds";

type PickLeg = StoredLeg;

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

export default function VirtualBoardPage() {
  const { user } = useAuth();
  const router = useRouter();
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

  const token = useCallback(async () => {
    if (!user) throw new Error("Sign in required");
    return user.getIdToken();
  }, [user]);

  const loadRound = useCallback(
    async (quiet = false) => {
      if (!user) return;
      if (!quiet) setBusy(true);
      try {
        const t = await token();
        const res = await fetch("/api/virtual/round", {
          headers: { Authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
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

  useEffect(() => {
    if (!round?.endsAt) return;
    if (now >= round.endsAt) void loadRound(true);
  }, [now, round?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(
    () => (round?.matches ?? []).filter((m) => m.league === league),
    [round, league]
  );

  const totalOdds = useMemo(
    () =>
      picks.length === 0
        ? 1
        : Math.round(picks.reduce((a, p) => a * p.odds, 1) * 100) / 100,
    [picks]
  );
  const stakeNum = Number(stake) || 0;
  const potential = Math.floor(stakeNum * totalOdds * 100) / 100;
  const msToNext = round?.endsAt != null ? Math.max(0, round.endsAt - now) : 0;

  function togglePick(
    m: VirtualMatchPublic,
    leg: Omit<PickLeg, "home" | "away">
  ) {
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
    if (!user || !round || busy || picks.length === 0) return;
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
      saveTicket({
        roundId: round.id,
        stake: stakeNum,
        potential: data.potential ?? potential,
        legs: [...picks],
        placedAt: Date.now(),
      });
      setPicks([]);
      sfxBet();
      router.push("/virtual/ticket");
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

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg pb-44 text-ink">
      <header className="sticky top-0 z-20 bg-brand px-3 py-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <Link href="/casino" className="text-sm font-semibold">
            ← Instant Football
          </Link>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tabular-nums">
            {balance == null ? "…" : chips(balance)} chips
          </span>
        </div>
        <div className="mt-2 flex justify-between text-[11px]">
          <span className="font-semibold">Round #{round?.index ?? "—"}</span>
          <span className="tabular-nums">Next round {fmtMs(msToNext)}</span>
        </div>
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
        <p className="mx-3 mt-2 text-center text-xs text-red-600">{err}</p>
      )}

      <div className="mt-2 flex flex-col gap-1 px-2">
        {matches.map((m) => {
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
                        on ? "bg-brand text-white" : "bg-emerald-500/5"
                      }`}
                    >
                      {od.toFixed(2)}
                    </button>
                  );
                })}
              </div>
              {open && (
                <div className="grid grid-cols-2 gap-2 border-t border-ink-muted/10 p-2">
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
                          on ? "bg-brand text-white" : "bg-ink-muted/10"
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

      <div
        className="fixed inset-x-0 z-40 border-t border-ink-muted/15 bg-surface/95 px-2 pt-2 backdrop-blur"
        style={{
          bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            type="button"
            onClick={() => void loadRound(false)}
            className="rounded-xl border border-ink-muted/20 px-3 py-2.5 text-xs font-bold"
          >
            Next
            <span className="block tabular-nums text-[10px] text-ink-muted">
              {fmtMs(msToNext)}
            </span>
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Stake"
            className="w-20 rounded-xl border border-ink-muted/20 bg-bg px-2 py-2 text-center text-sm font-bold tabular-nums"
          />
          <button
            type="button"
            disabled={busy || picks.length === 0}
            onClick={() => void placeBet()}
            className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {picks.length === 0
              ? "Betslip"
              : `Place · ${chips(potential)}`}
          </button>
        </div>
      </div>
    </main>
  );
}
