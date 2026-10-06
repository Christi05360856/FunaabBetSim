"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_HOUSE_EDGE,
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  type DiceDirection,
} from "@/types/casino";

function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

function multFor(target: number, direction: DiceDirection): number {
  const chance = direction === "under" ? target : 100 - target;
  if (chance <= 0 || chance >= 100) return 1.01;
  const fair = 100 / chance;
  const m = fair * (1 - CASINO_HOUSE_EDGE);
  return Math.max(1.01, Math.floor(m * 10000) / 10000);
}

type LastPlay = {
  roll: number;
  won: boolean;
  payout: number;
  profit: number;
  multiplier: number;
  target: number;
  direction: DiceDirection;
};

export default function DicePage() {
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<LastPlay | null>(null);

  const multiplier = useMemo(
    () => multFor(target, direction),
    [target, direction]
  );
  const winChance = direction === "under" ? target : 100 - target;
  const potential = Math.floor(stake * multiplier * 100) / 100;

  const loadBal = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/balance", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && typeof data.balance === "number") setBalance(data.balance);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void loadBal();
  }, [loadBal]);

  async function play() {
    if (!user || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "dice",
          stake,
          target,
          direction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Play failed");
      setBalance(data.balanceAfter);
      setLast({
        roll: data.roll,
        won: data.won,
        payout: data.payout,
        profit: data.profit,
        multiplier: data.multiplier,
        target: data.target,
        direction: data.direction,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  function setHalf() {
    setStake((s) => Math.max(CASINO_MIN_STAKE, Math.floor(s / 2)));
  }
  function setDouble() {
    setStake((s) => {
      const next = s * 2;
      const cap = balance != null ? Math.min(CASINO_MAX_STAKE, balance) : CASINO_MAX_STAKE;
      return Math.min(cap, next);
    });
  }
  function setMax() {
    if (balance == null) return;
    setStake(Math.min(CASINO_MAX_STAKE, Math.max(CASINO_MIN_STAKE, Math.floor(balance))));
  }

  if (authLoading) {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-sm text-ink-muted">Loading…</main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="text-sm text-ink-muted">Sign in to play.</p>
        <Link href="/login" className="mt-3 inline-block text-sm font-semibold text-brand">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/casino" className="text-sm font-medium text-brand">
          ← Casino
        </Link>
        <p className="text-sm tabular-nums text-ink">
          <span className="text-ink-muted">Demo </span>
          <span className="font-bold">{balance == null ? "…" : chips(balance)}</span>
        </p>
      </div>

      <h1 className="text-xl font-bold text-ink">Dice</h1>

      {/* Result */}
      <div
        className={`mt-4 rounded-2xl border px-4 py-6 text-center ${
          last == null
            ? "border-ink-muted/15 bg-surface"
            : last.won
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/25 bg-red-500/10"
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Roll
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-ink">
          {last ? last.roll.toFixed(2) : "—"}
        </p>
        {last && (
          <p
            className={`mt-2 text-sm font-semibold ${
              last.won ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {last.won
              ? `Won +${chips(last.profit)} · ${last.multiplier.toFixed(2)}x`
              : `Lost ${chips(Math.abs(last.profit))}`}
          </p>
        )}
      </div>

      {/* Direction */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDirection("under")}
          className={`rounded-xl py-2.5 text-sm font-semibold ${
            direction === "under"
              ? "bg-brand text-white"
              : "bg-surface text-ink border border-ink-muted/15"
          }`}
        >
          Roll under
        </button>
        <button
          type="button"
          onClick={() => setDirection("over")}
          className={`rounded-xl py-2.5 text-sm font-semibold ${
            direction === "over"
              ? "bg-brand text-white"
              : "bg-surface text-ink border border-ink-muted/15"
          }`}
        >
          Roll over
        </button>
      </div>

      {/* Target */}
      <div className="mt-4 rounded-2xl border border-ink-muted/15 bg-surface p-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>Target</span>
          <span className="font-semibold tabular-nums text-ink">{target.toFixed(0)}</span>
        </div>
        <input
          type="range"
          min={2}
          max={98}
          step={1}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="mt-2 w-full accent-emerald-600"
        />
        <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
          <span>Win chance {winChance.toFixed(0)}%</span>
          <span>{multiplier.toFixed(2)}x</span>
        </div>
      </div>

      {/* Stake */}
      <div className="mt-4 rounded-2xl border border-ink-muted/15 bg-surface p-3">
        <label className="text-xs font-semibold text-ink-muted">Stake</label>
        <input
          type="number"
          min={CASINO_MIN_STAKE}
          max={CASINO_MAX_STAKE}
          value={stake}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            setStake(Math.min(CASINO_MAX_STAKE, Math.max(0, Math.floor(v))));
          }}
          className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-transparent px-3 py-2 text-lg font-bold tabular-nums text-ink outline-none focus:border-brand"
        />
        <div className="mt-2 flex gap-2">
          {[
            { label: "½", fn: setHalf },
            { label: "2×", fn: setDouble },
            { label: "Max", fn: setMax },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.fn}
              className="flex-1 rounded-lg bg-ink-muted/10 py-1.5 text-xs font-semibold text-ink"
            >
              {b.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">
          Pays {chips(potential)} on win · min {CASINO_MIN_STAKE}
        </p>
      </div>

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
          {err}
        </p>
      )}

      <button
        type="button"
        disabled={
          busy ||
          balance == null ||
          balance < stake ||
          stake < CASINO_MIN_STAKE
        }
        onClick={() => void play()}
        className="mt-4 w-full rounded-2xl bg-brand py-3.5 text-base font-bold text-white disabled:opacity-50"
      >
        {busy ? "Rolling…" : "Play for free"}
      </button>
    </main>
  );
}
