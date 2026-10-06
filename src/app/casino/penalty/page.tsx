"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  PENALTY_MULT,
  type PenaltySide,
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
  shot?: PenaltySide;
  keeper?: PenaltySide;
  won?: boolean;
  multiplier?: number;
  payout?: number;
  balanceAfter?: number;
};

const SIDES: { id: PenaltySide; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
];

export default function PenaltyPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [shot, setShot] = useState<PenaltySide>("center");
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
        body: JSON.stringify({ game: "penalty", stake, shot }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");
      await new Promise((r) => setTimeout(r, 500));
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const resultText =
    last?.shot && last?.keeper
      ? last.won
        ? `GOAL! You → ${last.shot} · Keeper → ${last.keeper} · Payout ${chips(last.payout ?? 0)}`
        : `SAVED · You → ${last.shot} · Keeper → ${last.keeper} · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Penalty" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      <div className="mb-4 rounded-2xl border border-ink-muted/15 bg-surface p-4 text-center">
        <p className="text-4xl" aria-hidden>
          {busy ? "🏃" : last?.won === true ? "⚽✅" : last?.won === false ? "🧤" : "🥅"}
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          Pick a side · pays {PENALTY_MULT.toFixed(2)}x if keeper dives elsewhere
        </p>
        {last?.keeper && (
          <p className="mt-1 text-sm font-semibold capitalize text-ink">
            Keeper went {last.keeper}
          </p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {SIDES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => setShot(s.id)}
            className={`rounded-xl py-3 text-sm font-bold capitalize disabled:opacity-60 ${
              shot === s.id
                ? "bg-brand text-white"
                : "border border-ink-muted/15 bg-surface text-ink"
            }`}
          >
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
        potentialLabel={`Payout ${chips(Math.floor(stake * PENALTY_MULT * 100) / 100)}`}
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={
          balance == null || balance < stake || stake < CASINO_MIN_STAKE
        }
        label={`Shoot · ${shot}`}
        busyLabel="Shooting…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
