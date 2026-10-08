"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  KENO_MAX_PICKS,
  KENO_PAYTABLE,
  KENO_POOL,
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
  picks?: number[];
  drawn?: number[];
  hits?: number;
  multiplier?: number;
  payout?: number;
  profit?: number;
  won?: boolean;
  balanceAfter?: number;
};

export default function KenoPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PlayRes | null>(null);

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

  function toggle(n: number) {
    setResult(null);
    setPicks((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= KENO_MAX_PICKS) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  }

  const maxMult = useMemo(() => {
    const table = KENO_PAYTABLE[picks.length];
    if (!table) return 0;
    return Math.max(...Object.values(table));
  }, [picks.length]);

  async function play() {
    if (!user || busy || picks.length === 0) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game: "keno", stake, picks }),
      });
      const data: PlayRes = await res.json();
      if (!res.ok) throw new Error(data.error || "Play failed");
      setResult(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const drawnSet = new Set(result?.drawn ?? []);
  const pickSet = new Set(picks);

  return (
    <CasinoShell title="Keno" balance={balance}>
      <p className="mb-2 text-center text-[11px] text-ink-muted">
        Pick 1–{KENO_MAX_PICKS} numbers · draw {10} from {KENO_POOL}
      </p>
      <div className="mb-3 grid grid-cols-8 gap-1.5">
        {Array.from({ length: KENO_POOL }, (_, i) => i + 1).map((n) => {
          const selected = pickSet.has(n);
          const hit = drawnSet.has(n) && selected;
          const drawn = drawnSet.has(n);
          return (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => toggle(n)}
              className={`aspect-square rounded-lg text-xs font-bold tabular-nums disabled:opacity-70 ${
                hit
                  ? "bg-emerald-600 text-white"
                  : selected
                    ? "bg-brand text-white"
                    : drawn
                      ? "bg-ink-muted/20 text-ink-muted"
                      : "border border-ink-muted/15 bg-surface text-ink"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-center text-xs text-ink-muted">
        {picks.length} selected
        {maxMult > 0 ? ` · max ${maxMult}x` : ""}
        {picks.length > 0 && (
          <button
            type="button"
            className="ml-2 font-semibold text-red-500"
            onClick={() => {
              setPicks([]);
              setResult(null);
            }}
          >
            Clear
          </button>
        )}
      </p>

      {result && (
        <ResultBanner
          won={!!result.won}
          text={
            result.won
              ? `${result.hits} hit · +${chips(result.profit ?? 0)} · ${result.multiplier}x`
              : `${result.hits ?? 0} hit · −${chips(stake)}`
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
        disabled={
          balance == null ||
          balance < stake ||
          stake < CASINO_MIN_STAKE ||
          picks.length === 0
        }
        label="Draw"
        busyLabel="Drawing…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
