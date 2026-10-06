"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  type CoinSide,
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
  const [flipFace, setFlipFace] = useState<CoinSide>("heads");
  const [flipping, setFlipping] = useState(false);

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

  useEffect(() => {
    if (!flipping) return;
    const t = setInterval(() => {
      setFlipFace((f) => (f === "heads" ? "tails" : "heads"));
    }, 90);
    return () => clearInterval(t);
  }, [flipping]);

  async function play() {
    if (!user || busy) return;
    setBusy(true);
    setErr(null);
    setLast(null);
    setFlipping(true);
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
      await new Promise((r) => setTimeout(r, 900));
      setFlipping(false);
      if (data.flip) setFlipFace(data.flip);
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setFlipping(false);
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const resultText =
    last?.flip != null
      ? last.won
        ? `Landed ${last.flip.toUpperCase()} · You picked ${pick} · +${chips(last.profit ?? 0)}`
        : `Landed ${last.flip.toUpperCase()} · You picked ${pick} · Lost ${chips(stake)}`
      : null;

  const faceEmoji = flipFace === "heads" ? "👑" : "🐚";
  const faceLabel = flipFace === "heads" ? "Heads" : "Tails";

  return (
    <CasinoShell title="Coin Flip" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {/* Flip stage */}
      <div className="mb-4 flex flex-col items-center">
        <div
          className={`flex h-28 w-28 flex-col items-center justify-center rounded-full border-4 border-brand/30 bg-surface shadow-md ${
            flipping ? "animate-pulse" : ""
          }`}
          style={
            flipping
              ? {
                  transform: `rotateY(${Date.now() % 360}deg)`,
                  transition: "transform 90ms linear",
                }
              : undefined
          }
        >
          <span className="text-4xl" aria-hidden>
            {faceEmoji}
          </span>
          <span className="mt-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {flipping ? "…" : faceLabel}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">
          {flipping ? "Flipping…" : last ? `Result: ${last.flip}` : "Pick a side, then flip"}
        </p>
      </div>

      {/* Compact pick row */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {([
          { id: "heads" as const, label: "Heads", emoji: "👑" },
          { id: "tails" as const, label: "Tails", emoji: "🐚" },
        ]).map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => setPick(s.id)}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold transition active:scale-[0.98] disabled:opacity-60 ${
              pick === s.id
                ? "border-brand bg-brand/10 text-ink"
                : "border-ink-muted/15 bg-surface text-ink"
            }`}
          >
            <span aria-hidden>{s.emoji}</span>
            {s.label}
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
        disabled={
          balance == null || balance < stake || stake < CASINO_MIN_STAKE
        }
        label={`Flip · ${pick}`}
        busyLabel="Flipping…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
