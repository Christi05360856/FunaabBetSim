"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  PLINKO_SLOTS,
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
  slot?: number;
  multiplier?: number;
  payout?: number;
  profit?: number;
  won?: boolean;
  balanceAfter?: number;
  path?: number[];
};

export default function PlinkoPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PlayRes | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  const loadBal = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/casino/balance", {
      headers: { Authorization: `Bearer ${token}` },
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
    setResult(null);
    setDropSlot(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game: "plinko", stake }),
      });
      const data: PlayRes = await res.json();
      if (!res.ok) throw new Error(data.error || "Play failed");
      setDropSlot(typeof data.slot === "number" ? data.slot : null);
      // brief drop animation delay before showing banner
      await new Promise((r) => setTimeout(r, 600));
      setResult(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CasinoShell title="Plinko" balance={balance}>
      <div className="mb-4 overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface p-3">
        <div className="mb-3 flex justify-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-ink-muted/30"
              style={{ marginTop: i % 2 === 0 ? 0 : 6 }}
            />
          ))}
        </div>
        <div className="flex gap-1">
          {PLINKO_SLOTS.map((m, i) => (
            <div
              key={i}
              className={`flex flex-1 flex-col items-center rounded-lg py-2 text-center transition ${
                dropSlot === i
                  ? "bg-brand text-white shadow"
                  : "bg-emerald-500/10 text-ink"
              }`}
            >
              <span className="text-[10px] font-bold tabular-nums">
                {m.toFixed(1)}x
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          Drop the ball · land on a multiplier
        </p>
      </div>

      {result && (
        <ResultBanner
          won={!!result.won}
          text={
            result.won
              ? `+${chips(result.profit ?? 0)} · ${result.multiplier}x`
              : `−${chips(stake)}`
          }
        />
      )}

      <StakeBar
        stake={stake}
        setStake={setStake}
        balance={balance}
        min={CASINO_MIN_STAKE}
        max={CASINO_MAX_STAKE}
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={balance == null || balance < stake || stake < CASINO_MIN_STAKE}
        label="Drop"
        busyLabel="Dropping…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
