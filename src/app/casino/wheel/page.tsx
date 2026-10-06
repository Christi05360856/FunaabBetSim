"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE, WHEEL_SEGMENTS } from "@/types/casino";

function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

export default function WheelPage() {
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<{
    segment: number;
    multiplier: number;
    won: boolean;
    profit: number;
  } | null>(null);

  const loadBal = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/casino/balance", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok) setBalance(data.balance);
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
        body: JSON.stringify({ game: "wheel", stake }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setBalance(data.balanceAfter);
      setLast({
        segment: data.segment,
        multiplier: data.multiplier,
        won: data.won,
        profit: data.profit,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <main className="p-4 text-sm text-ink-muted">Loading…</main>;
  if (!user)
    return (
      <main className="p-4 text-center">
        <Link href="/login" className="font-semibold text-brand">
          Sign in
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/casino" className="text-sm font-medium text-brand">
          ← Casino
        </Link>
        <p className="text-sm tabular-nums">
          <span className="text-ink-muted">Demo </span>
          <span className="font-bold">{balance == null ? "…" : chips(balance)}</span>
        </p>
      </div>
      <h1 className="text-xl font-bold text-ink">Wheel</h1>

      <div
        className={`mt-4 rounded-2xl border px-4 py-8 text-center ${
          last == null
            ? "border-ink-muted/15 bg-surface"
            : last.won
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/25 bg-red-500/10"
        }`}
      >
        <p className="text-4xl font-bold tabular-nums text-ink">
          {last ? `${last.multiplier}x` : "—"}
        </p>
        {last && (
          <p
            className={`mt-2 text-sm font-semibold ${
              last.won ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"
            }`}
          >
            {last.won ? `Won +${chips(last.profit)}` : `Lost ${chips(Math.abs(last.profit))}`}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {WHEEL_SEGMENTS.map((m, i) => (
          <span
            key={i}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${
              last?.segment === i
                ? "bg-brand text-white"
                : "bg-ink-muted/10 text-ink-muted"
            }`}
          >
            {m}x
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-ink-muted/15 bg-surface p-3">
        <label className="text-xs font-semibold text-ink-muted">Stake</label>
        <input
          type="number"
          min={CASINO_MIN_STAKE}
          max={CASINO_MAX_STAKE}
          value={stake}
          onChange={(e) => setStake(Math.floor(Number(e.target.value) || 0))}
          className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-transparent px-3 py-2 text-lg font-bold tabular-nums outline-none focus:border-brand"
        />
      </div>

      {err && <p className="mt-2 text-center text-xs text-red-600">{err}</p>}

      <button
        type="button"
        disabled={busy || balance == null || balance < stake || stake < CASINO_MIN_STAKE}
        onClick={() => void play()}
        className="mt-4 w-full rounded-2xl bg-brand py-3.5 text-base font-bold text-white disabled:opacity-50"
      >
        {busy ? "Spinning…" : "Play for free"}
      </button>
    </main>
  );
}
