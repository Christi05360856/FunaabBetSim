"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE, type CoinSide } from "@/types/casino";
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
  flip?: CoinSide;
  won?: boolean;
  multiplier?: number;
  profit?: number;
  balanceAfter?: number;
};

export default function CoinPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [pick, setPick] = useState<CoinSide>("heads");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);

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
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game: "coin", stake, pick }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const resultText =
    last?.flip != null
      ? last.won
        ? `${last.flip.toUpperCase()} · +${chips(last.profit ?? 0)}`
        : `${last.flip.toUpperCase()} · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Coin Flip" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {/* Big pick */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {([
          { id: "heads" as const, label: "Heads", emoji: "👑" },
          { id: "tails" as const, label: "Tails", emoji: "🐚" },
        ]).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPick(s.id)}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 py-8 transition active:scale-[0.98] ${
              pick === s.id
                ? "border-brand bg-brand/10 shadow-sm"
                : "border-ink-muted/15 bg-surface"
            }`}
          >
            <span className="text-4xl" aria-hidden>
              {s.emoji}
            </span>
            <span className="mt-2 text-base font-extrabold">{s.label}</span>
            <span className="mt-1 text-[11px] text-ink-muted">~1.98x</span>
          </button>
        ))}
      </div>

      <StakeBar
        stake={stake}
        setStake={setStake}
        balance={balance}
        min={CASINO_MIN_STAKE}
        max={CASINO_MAX_STAKE}
        potentialLabel={`Win ~${chips(Math.floor(stake * 1.98))}`}
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={balance == null || balance < stake || stake < CASINO_MIN_STAKE}
        label={`Flip · ${pick}`}
        busyLabel="Flipping…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
