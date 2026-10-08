"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  PENALTY_SERIES_MULT,
  PENALTY_SERIES_SHOTS,
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
  shots?: PenaltySide[];
  keepers?: PenaltySide[];
  results?: boolean[];
  goals?: number;
  multiplier?: number;
  payout?: number;
  profit?: number;
  won?: boolean;
  balanceAfter?: number;
};

const SIDES: { id: PenaltySide; label: string }[] = [
  { id: "left", label: "L" },
  { id: "center", label: "C" },
  { id: "right", label: "R" },
];

export default function PenaltySeriesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [shots, setShots] = useState<PenaltySide[]>(
    Array(PENALTY_SERIES_SHOTS).fill("center") as PenaltySide[]
  );
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

  function setShot(i: number, side: PenaltySide) {
    setResult(null);
    setShots((prev) => {
      const next = [...prev];
      next[i] = side;
      return next;
    });
  }

  async function play() {
    if (!user || busy) return;
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
        body: JSON.stringify({ game: "penalty-series", stake, shots }),
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

  return (
    <CasinoShell title="Penalty Series" balance={balance}>
      <p className="mb-3 text-center text-[11px] text-ink-muted">
        Aim all {PENALTY_SERIES_SHOTS} shots · more goals = higher mult
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {shots.map((shot, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-xl border border-ink-muted/12 bg-surface px-3 py-2"
          >
            <span className="w-12 text-xs font-bold text-ink-muted">
              Shot {i + 1}
            </span>
            <div className="flex flex-1 gap-1">
              {SIDES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setShot(i, s.id)}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold disabled:opacity-60 ${
                    shot === s.id
                      ? "bg-brand text-white"
                      : "bg-ink-muted/10 text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {result?.results && (
              <span
                className={`w-10 text-center text-xs font-bold ${
                  result.results[i] ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {result.results[i] ? "⚽" : "🧤"}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap justify-center gap-2 text-[10px] text-ink-muted">
        {Object.entries(PENALTY_SERIES_MULT).map(([g, m]) => (
          <span key={g} className="rounded-full bg-ink-muted/10 px-2 py-0.5">
            {g}⚽ → {m}x
          </span>
        ))}
      </div>

      {result && (
        <ResultBanner
          won={!!result.won}
          text={
            result.won
              ? `${result.goals} goals · +${chips(result.profit ?? 0)} · ${result.multiplier}x`
              : `${result.goals ?? 0} goals · −${chips(stake)}`
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
        label="Take series"
        busyLabel="Shooting…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
