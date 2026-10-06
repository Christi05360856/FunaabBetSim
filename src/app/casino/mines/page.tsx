"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_HOUSE_EDGE,
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
} from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";

type PlayRes = {
  ok?: boolean;
  error?: string;
  mineCount?: number;
  picks?: number[];
  /** Server field name is `mines` */
  mines?: number[];
  hit?: number | null;
  won?: boolean;
  multiplier?: number;
  payout?: number;
  profit?: number;
  balanceAfter?: number;
};

function previewMultiplier(mineCount: number, pickCount: number): number {
  if (pickCount <= 0) return 1;
  const safe = MINES_GRID - mineCount;
  if (pickCount > safe) return 0;
  let p = 1;
  for (let i = 0; i < pickCount; i++) {
    p *= (safe - i) / (MINES_GRID - i);
  }
  if (p <= 0) return 0;
  return Math.max(1.01, Math.floor((1 / p) * (1 - CASINO_HOUSE_EDGE) * 10000) / 10000);
}

export default function MinesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [mineCount, setMineCount] = useState(3);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [reveal, setReveal] = useState(false);

  const mult = useMemo(
    () => previewMultiplier(mineCount, selected.length),
    [mineCount, selected.length]
  );
  const potential =
    selected.length > 0 ? Math.floor(stake * mult * 100) / 100 : 0;

  const loadBal = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/casino/balance", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok && typeof data.balance === "number") setBalance(data.balance);
  }, [user]);

  useEffect(() => {
    void loadBal();
  }, [loadBal]);

  // After reveal, auto-reset to a fresh board in 5s
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => {
      setReveal(false);
      setLast(null);
      setSelected([]);
      setErr(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [reveal]);

  function toggle(i: number) {
    if (busy || reveal) return;
    setSelected((prev) => {
      if (prev.includes(i)) return prev.filter((x) => x !== i);
      const maxSafe = MINES_GRID - mineCount;
      if (prev.length >= maxSafe) return prev;
      return [...prev, i];
    });
  }

  function resetBoard() {
    setReveal(false);
    setLast(null);
    setSelected([]);
    setErr(null);
  }

  async function play() {
    if (!user || busy || selected.length === 0) return;
    setBusy(true);
    setErr(null);
    setLast(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "mines",
          stake,
          mineCount,
          picks: selected,
        }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");
      setLast(data);
      setReveal(true);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const mineSet = new Set(last?.mines ?? []);
  const pickSet = new Set(last?.picks ?? selected);

  const resultText =
    last != null
      ? last.won
        ? `Safe! Payout ${chips(last.payout ?? 0)} · ${last.multiplier?.toFixed(2)}x`
        : `Hit a mine · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Mines" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      <div className="mb-3 flex items-center justify-between rounded-2xl border border-ink-muted/15 bg-surface px-3 py-2.5">
        <span className="text-xs font-semibold text-ink-muted">Mines</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={reveal || busy}
            onClick={() =>
              setMineCount((c) => Math.max(MINES_MIN, c - 1))
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-muted/10 text-sm font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-extrabold tabular-nums">
            {mineCount}
          </span>
          <button
            type="button"
            disabled={reveal || busy}
            onClick={() =>
              setMineCount((c) => Math.min(MINES_MAX, c + 1))
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-muted/10 text-sm font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>
        <span className="text-sm font-extrabold tabular-nums text-brand">
          {selected.length > 0 ? `${mult.toFixed(2)}x` : "—"}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-5 gap-2">
        {Array.from({ length: MINES_GRID }, (_, i) => {
          const isPick = pickSet.has(i);
          const isMine = reveal && mineSet.has(i);
          const isSafe = reveal && isPick && !isMine;
          return (
            <button
              key={i}
              type="button"
              disabled={busy || reveal}
              onClick={() => toggle(i)}
              className={`flex aspect-square items-center justify-center rounded-xl text-lg font-bold transition active:scale-95 disabled:cursor-default ${
                isMine
                  ? "bg-red-500 text-white shadow-sm"
                  : isSafe
                    ? "bg-emerald-500 text-white shadow-sm"
                    : isPick && !reveal
                      ? "bg-brand/20 ring-2 ring-brand"
                      : "border border-ink-muted/15 bg-surface"
              }`}
            >
              {isMine ? "💣" : isSafe ? "💎" : isPick && !reveal ? "·" : ""}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-center text-[11px] text-ink-muted">
        {reveal
          ? "Next round in a few seconds…"
          : selected.length === 0
            ? "Tap tiles to open"
            : `${selected.length} selected · max ${MINES_GRID - mineCount} safe`}
      </p>

      <StakeBar
        stake={stake}
        setStake={setStake}
        balance={balance}
        min={CASINO_MIN_STAKE}
        max={CASINO_MAX_STAKE}
        potentialLabel={
          selected.length > 0 ? `Payout ${chips(potential)}` : undefined
        }
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      {reveal ? (
        <PrimaryBtn
          busy={false}
          disabled={false}
          label="Play again"
          busyLabel=""
          onClick={resetBoard}
        />
      ) : (
        <PrimaryBtn
          busy={busy}
          disabled={
            balance == null ||
            balance < stake ||
            stake < CASINO_MIN_STAKE ||
            selected.length === 0
          }
          label="Reveal"
          busyLabel="Revealing…"
          onClick={() => void play()}
        />
      )}
    </CasinoShell>
  );
        }
