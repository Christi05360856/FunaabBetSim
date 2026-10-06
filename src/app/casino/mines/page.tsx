"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_HOUSE_EDGE,
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
} from "@/types/casino";

function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

function previewMult(mineCount: number, revealCount: number): number {
  if (revealCount < 1) return 1;
  let prob = 1;
  for (let i = 0; i < revealCount; i++) {
    const safe = MINES_GRID - mineCount - i;
    const left = MINES_GRID - i;
    if (safe <= 0 || left <= 0) return 1.01;
    prob *= safe / left;
  }
  if (prob <= 0) return 1.01;
  return Math.max(1.01, Math.floor((1 / prob) * (1 - CASINO_HOUSE_EDGE) * 10000) / 10000);
}

export default function MinesPage() {
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [mineCount, setMineCount] = useState(3);
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mines, setMines] = useState<number[] | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [lastWon, setLastWon] = useState<boolean | null>(null);
  const [lastProfit, setLastProfit] = useState(0);
  const [lastMult, setLastMult] = useState(0);

  const mult = useMemo(
    () => previewMult(mineCount, picks.length),
    [mineCount, picks.length]
  );

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

  function toggle(i: number) {
    if (mines) return; // locked after play until clear
    setPicks((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }

  function clearBoard() {
    setPicks([]);
    setMines(null);
    setHit(null);
    setLastWon(null);
  }

  async function play() {
    if (!user || busy || picks.length < 1) return;
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
        body: JSON.stringify({ game: "mines", stake, mineCount, picks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setBalance(data.balanceAfter);
      setMines(data.mines);
      setHit(data.hit);
      setLastWon(data.won);
      setLastProfit(data.profit);
      setLastMult(data.multiplier);
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
      <h1 className="text-xl font-bold text-ink">Mines</h1>
      <p className="text-xs text-ink-muted">Tap tiles to open · avoid mines</p>

      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs text-ink-muted">Mines</label>
        <input
          type="range"
          min={MINES_MIN}
          max={MINES_MAX}
          value={mineCount}
          disabled={!!mines}
          onChange={(e) => {
            setMineCount(Number(e.target.value));
            setPicks([]);
          }}
          className="flex-1 accent-emerald-600"
        />
        <span className="w-6 text-sm font-bold">{mineCount}</span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: MINES_GRID }, (_, i) => {
          const selected = picks.includes(i);
          const isMine = mines?.includes(i);
          const isHit = hit === i;
          let cls =
            "aspect-square rounded-lg text-sm font-bold border border-ink-muted/15 ";
          if (mines) {
            if (isHit) cls += "bg-red-500 text-white";
            else if (isMine) cls += "bg-red-500/20 text-red-700";
            else if (selected) cls += "bg-emerald-500/20 text-emerald-800";
            else cls += "bg-surface text-ink-muted";
          } else {
            cls += selected
              ? "bg-brand text-white"
              : "bg-surface text-ink active:bg-brand/20";
          }
          return (
            <button
              key={i}
              type="button"
              disabled={!!mines}
              onClick={() => toggle(i)}
              className={cls}
            >
              {mines ? (isMine ? "💣" : selected ? "◆" : "") : selected ? "◆" : ""}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-xs text-ink-muted">
        {picks.length} open · {mult.toFixed(2)}x
        {lastWon != null && (
          <span
            className={
              lastWon
                ? " ml-2 font-semibold text-emerald-700"
                : " ml-2 font-semibold text-red-600"
            }
          >
            {lastWon ? `+${chips(lastProfit)} · ${lastMult}x` : `Lost ${chips(Math.abs(lastProfit))}`}
          </span>
        )}
      </p>

      <div className="mt-3 rounded-2xl border border-ink-muted/15 bg-surface p-3">
        <label className="text-xs font-semibold text-ink-muted">Stake</label>
        <input
          type="number"
          min={CASINO_MIN_STAKE}
          max={CASINO_MAX_STAKE}
          value={stake}
          disabled={!!mines}
          onChange={(e) => setStake(Math.floor(Number(e.target.value) || 0))}
          className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-transparent px-3 py-2 text-lg font-bold tabular-nums outline-none focus:border-brand"
        />
      </div>

      {err && <p className="mt-2 text-center text-xs text-red-600">{err}</p>}

      {mines ? (
        <button
          type="button"
          onClick={clearBoard}
          className="mt-4 w-full rounded-2xl border border-brand py-3.5 text-base font-bold text-brand"
        >
          Play again
        </button>
      ) : (
        <button
          type="button"
          disabled={
            busy ||
            picks.length < 1 ||
            balance == null ||
            balance < stake ||
            stake < CASINO_MIN_STAKE
          }
          onClick={() => void play()}
          className="mt-4 w-full rounded-2xl bg-brand py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {busy ? "Revealing…" : "Play for free"}
        </button>
      )}
    </main>
  );
}
