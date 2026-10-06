"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  payout?: number;
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
  const [flying, setFlying] = useState(false);
  const [crashed, setCrashed] = useState(false);
  /** Locked target for the in-flight round (ignores slider moves during fly). */
  const lockedCashout = useRef(2);

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

  const planeBottom = Math.min(85, 8 + Math.log2(Math.max(1, displayX)) * 22);

  async function play() {
    if (!user || busy) return;
    const target = Math.floor(cashoutAt * 100) / 100;
    lockedCashout.current = target;

    setBusy(true);
    setErr(null);
    setLast(null);
    setDisplayX(1);
    setFlying(true);
    setCrashed(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "crash",
          stake,
          cashoutAt: target,
        }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");

      const end = data.crashPoint ?? 1;
      const steps = 28;
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, 35));
        setDisplayX(1 + (end - 1) * (i / steps));
      }
      setDisplayX(end);
      setCrashed(true);
      setFlying(false);
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
      if (typeof data.crashPoint === "number") {
        setHistory((h) => [data.crashPoint!, ...h].slice(0, 10));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
      setFlying(false);
    } finally {
      setBusy(false);
    }
  }

  const potential = Math.floor(stake * cashoutAt * 100) / 100;
  const resultText =
    last != null && typeof last.crashPoint === "number"
      ? last.won
        ? `Crashed ${last.crashPoint.toFixed(2)}x · Cashed ${Number(last.cashoutAt).toFixed(2)}x · Payout ${chips(last.payout ?? Math.floor(stake * Number(last.cashoutAt) * 100) / 100)}`
        : `Crashed ${last.crashPoint.toFixed(2)}x before ${Number(last.cashoutAt ?? lockedCashout.current).toFixed(2)}x · Lost ${chips(stake)}`
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

      <div className="relative mb-4 h-48 overflow-hidden rounded-2xl border border-ink-muted/15 bg-gradient-to-b from-sky-200/40 via-surface to-surface dark:from-sky-900/20">
        <div className="absolute bottom-3 left-4 right-4 h-px bg-ink-muted/20" />
        <div
          className={`absolute left-1/2 text-3xl transition-all duration-75 ${
            crashed ? "opacity-40" : "opacity-100"
          }`}
          style={{
            bottom: `${planeBottom}%`,
            transform: crashed
              ? "translateX(-50%) rotate(35deg)"
              : flying
                ? "translateX(-50%) rotate(-12deg)"
                : "translateX(-50%) rotate(0deg)",
          }}
          aria-hidden
        >
          ✈️
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <p
            className={`text-4xl font-black tabular-nums tracking-tight ${
              last?.won === false
                ? "text-red-500"
                : last?.won === true
                  ? "text-emerald-500"
                  : "text-ink"
            }`}
          >
            {displayX.toFixed(2)}x
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-muted">
            {busy
              ? `Cash out locked at ${lockedCashout.current.toFixed(2)}x`
              : `Will cash out at ${cashoutAt.toFixed(2)}x`}
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-ink-muted/15 bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-muted">
            Auto cash out
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
          disabled={busy}
          onChange={(e) => setCashoutAt(Number(e.target.value))}
          className="mt-2 w-full accent-emerald-600 disabled:opacity-50"
        />
        <div className="mt-2 flex gap-2">
          {[1.5, 2, 3, 5].map((v) => (
            <button
              key={v}
              type="button"
              disabled={busy}
              onClick={() => setCashoutAt(v)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold disabled:opacity-50 ${
                Math.abs(cashoutAt - v) < 0.001
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
        potentialLabel={`Win ${chips(potential)} if plane passes ${cashoutAt.toFixed(2)}x`}
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={
          balance == null || balance < stake || stake < CASINO_MIN_STAKE
        }
        label="Place bet"
        busyLabel="Flying…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
