"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  HILO_MAX,
  HILO_MIN,
  type HiloChoice,
} from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";

const FACES = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

type PlayRes = {
  ok?: boolean;
  error?: string;
  current?: number;
  next?: number;
  choice?: HiloChoice;
  won?: boolean;
  multiplier?: number;
  payout?: number;
  profit?: number;
  balanceAfter?: number;
};

export default function HiloPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [current, setCurrent] = useState(7);
  const [choice, setChoice] = useState<HiloChoice>("higher");
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

  function newCard() {
    const n =
      HILO_MIN + Math.floor(Math.random() * (HILO_MAX - HILO_MIN + 1));
    setCurrent(n);
    setResult(null);
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
        body: JSON.stringify({ game: "hilo", stake, current, choice }),
      });
      const data: PlayRes = await res.json();
      if (!res.ok) throw new Error(data.error || "Play failed");
      setResult(data);
      if (typeof data.next === "number") {
        const nextCard = data.next;
        setCurrent(nextCard);
        // Nothing beats a King / sits below an Ace — flip to the possible side.
        setChoice((c) =>
          nextCard >= 13 && c === "higher"
            ? "lower"
            : nextCard <= 1 && c === "lower"
              ? "higher"
              : c
        );
      }
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CasinoShell title="Hi-Lo" balance={balance}>
      <div className="mb-4 flex flex-col items-center gap-3">
        <p className="text-[11px] font-semibold text-ink-muted">Current card</p>
        <div className="flex h-28 w-20 items-center justify-center rounded-2xl border-2 border-brand bg-surface text-4xl font-extrabold shadow-sm">
          {FACES[current] ?? current}
        </div>
        {result?.next != null && (
          <p className="text-sm font-bold text-ink-muted">
            Next:{" "}
            <span className="text-ink">{FACES[result.next] ?? result.next}</span>
          </p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["higher", "lower"] as const).map((c) => (
          <button
            key={c}
            type="button"
            disabled={busy || (c === "higher" ? current >= 13 : current <= 1)}
            onClick={() => setChoice(c)}
            className={`rounded-xl py-3 text-sm font-bold capitalize disabled:opacity-60 ${
              choice === c
                ? "bg-brand text-white"
                : "border border-ink-muted/15 bg-surface text-ink"
            }`}
          >
            {c === "higher" ? "Higher ▲" : "Lower ▼"}
          </button>
        ))}
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

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={newCard}
          disabled={busy}
          className="rounded-xl border border-ink-muted/20 px-4 py-3 text-xs font-bold text-ink-muted disabled:opacity-50"
        >
          New card
        </button>
        <div className="flex-1">
          <PrimaryBtn
            busy={busy}
            disabled={
              balance == null || balance < stake || stake < CASINO_MIN_STAKE
            }
            label={`Play ${choice}`}
            busyLabel="…"
            onClick={() => void play()}
          />
        </div>
      </div>
    </CasinoShell>
  );
}
