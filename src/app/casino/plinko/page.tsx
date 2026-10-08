"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  PLINKO_ROWS,
  PLINKO_SLOTS,
} from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";
import PlinkoBoard from "@/components/PlinkoBoard";

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

type BoardResult = { id: number; path: number[] };

/** Fallback path if the server ever omits it: lands on the given slot. */
function pathFromSlot(slot: number, rows: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows; i++) out.push(i < slot ? 1 : 0);
  // simple shuffle so it doesn't look scripted
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i] ?? 0;
    const b = out[j] ?? 0;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export default function PlinkoPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PlayRes | null>(null);
  const [board, setBoard] = useState<BoardResult | null>(null);

  const pending = useRef<PlayRes | null>(null);
  const playedStake = useRef(100);

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

  // Called by the board once the ball has landed
  const onLanded = useCallback(() => {
    const data = pending.current;
    pending.current = null;
    if (data) {
      setResult(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    }
    setBusy(false);
  }, []);

  async function play() {
    if (!user || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    playedStake.current = stake;
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

      const path =
        Array.isArray(data.path) && data.path.length === PLINKO_ROWS
          ? data.path
          : pathFromSlot(typeof data.slot === "number" ? data.slot : 0, PLINKO_ROWS);

      pending.current = data;
      setBoard({ id: Date.now(), path }); // starts the animation
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <CasinoShell title="Plinko" balance={balance}>
      <div className="mb-4 overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface p-2">
        <PlinkoBoard
          rows={PLINKO_ROWS}
          slots={PLINKO_SLOTS}
          result={board}
          onDone={onLanded}
        />
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
              : `−${chips(playedStake.current)}`
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
