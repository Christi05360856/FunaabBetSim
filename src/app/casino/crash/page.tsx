"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
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
  crashPoint?: number;
  cashoutAt?: number;
  won?: boolean;
  multiplier?: number;
  profit?: number;
  balanceAfter?: number;
};

export default function CrashPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [cashoutAt, setCashoutAt] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [displayX, setDisplayX] = useState(1);

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

  async function play() {
    if (!user || busy) return;
    setBusy(true);
    setErr(null);
    setLast(null);
    setDisplayX(1);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game: "crash", stake, cashoutAt }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");

      // Animate up to crash (or cashout visual)
      const end = data.crashPoint ?? 1;
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, 30));
        setDisplayX(1 + (end - 1) * (i / steps));
      }
      setDisplayX(end);
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
      if (typeof data.crashPoint === "number") {
        setHistory((h) => [data.crashPoint!, ...h].slice(0, 10));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const potential = Math.floor(stake * cashoutAt * 100) / 100;
  const resultText =
    last != null && typeof last.crashPoint === "number"
      ? last.won
        ? `Crashed ${last.crashPoint.toFixed(2)}x · Cashed ${last.cashoutAt?.toFixed(2)}x · +${chips(last.profit ?? 0)}`
        : `Crashed ${last.crashPoint.toFixed(2)}x · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Crash Lite" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {history.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {history.map((x, i) => (
            <span
              key={`${x}-${i}`}
              className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums ${
                x >= 2
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : x >= 1.5
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {x.toFixed(2)}x
            </span>
          ))}
        </div>
      )}

      {/* Multiplier stage */}
      <div className="mb-4 flex h-40 flex-col items-center justify-center rounded-2xl border border-ink-muted/15 bg-surface">
        <p
          className={`text-5xl font-black tabular-nums tracking-tight ${
            last?.won === false
              ? "text-red-500"
              : last?.won === true
                ? "text-emerald-500"
                : "text-ink"
          }`}
        >
          {displayX.toFixed(2)}x
        </p>
        <p className="mt-2 text-[11px] font-semibold text-ink-muted">
          Auto cash out at {cashoutAt.toFixed(2)}x
        </p>
      </div>

      {/* Cashout target */}
      <div className="mb-3 rounded-2xl border border-ink-muted/15 bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-muted">
            Cash out at
          </span>
          <span className="text-sm font-extrabold tabular-nums">
            {cashoutAt.toFixed(2)}x
          </span>
        </div>
        <input
          type="range"
          min={1.01}
          max={10}
          step={0.01}
          value={cashoutAt}
          onChange={(e) => setCashoutAt(Number(e.target.value))}
          className="mt-2 w-full accent-emerald-600"
        />
        <div className="mt-2 flex gap-2">
          {[1.5, 2, 3, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCashoutAt(v)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${
                cashoutAt === v
                  ? "bg-brand text-white"
                  : "bg-ink-muted/10 text-ink"
              }`}
            >
              {v}x
            </button>
          ))}
        </div>
      </div>

      <StakeBar
        stake={stake}
        setStake={setStake}
        balance={balance}
        min={CASINO_MIN_STAKE}
        max={CASINO_MAX_STAKE}
        potentialLabel={`Win ${chips(potential)}`}
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={balance == null || balance < stake || stake < CASINO_MIN_STAKE}
        label="Place bet"
        busyLabel="Flying…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
          }
