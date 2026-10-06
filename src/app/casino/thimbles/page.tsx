"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  THIMBLES_MULT,
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
  ball?: number;
  pick?: number;
  won?: boolean;
  multiplier?: number;
  payout?: number;
  balanceAfter?: number;
};

export default function ThimblesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [pick, setPick] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [lifted, setLifted] = useState<number | null>(null);

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
    setLifted(null);
    setShuffling(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game: "thimbles", stake, pick }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");
      await new Promise((r) => setTimeout(r, 900));
      setShuffling(false);
      setLifted(typeof data.ball === "number" ? data.ball : null);
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setShuffling(false);
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const resultText =
    last != null && typeof last.ball === "number"
      ? last.won
        ? `Ball under cup ${last.ball + 1} · Payout ${chips(last.payout ?? 0)}`
        : `Ball under cup ${last.ball + 1} · You picked ${(last.pick ?? pick) + 1} · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Thimbles" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      <p className="mb-3 text-center text-xs text-ink-muted">
        Find the ball · pays {THIMBLES_MULT.toFixed(2)}x
      </p>

      <div className="mb-5 flex items-end justify-center gap-3">
        {[0, 1, 2].map((i) => {
          const selected = pick === i;
          const showBall = lifted === i;
          const lift = lifted === i;
          return (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={() => setPick(i)}
              className={`relative flex w-[28%] flex-col items-center ${
                shuffling ? "animate-bounce" : ""
              }`}
            >
              <div
                className={`flex h-24 w-full items-end justify-center rounded-t-[50%] border-2 transition-transform duration-500 ${
                  selected
                    ? "border-brand bg-brand/15"
                    : "border-ink-muted/25 bg-surface"
                } ${lift ? "-translate-y-8" : ""}`}
              >
                <span className="mb-2 text-3xl" aria-hidden>
                  🥛
                </span>
              </div>
              {showBall && (
                <span
                  className="absolute bottom-10 text-2xl drop-shadow"
                  aria-hidden
                >
                  ⚽
                </span>
              )}
              <span
                className={`mt-2 text-xs font-bold ${
                  selected ? "text-brand" : "text-ink-muted"
                }`}
              >
                Cup {i + 1}
              </span>
            </button>
          );
        })}
      </div>

      <StakeBar
        stake={stake}
        setStake={setStake}
        balance={balance}
        min={CASINO_MIN_STAKE}
        max={CASINO_MAX_STAKE}
        potentialLabel={`Payout ${chips(
          Math.floor(stake * THIMBLES_MULT * 100) / 100
        )}`}
      />

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={
          balance == null || balance < stake || stake < CASINO_MIN_STAKE
        }
        label={`Reveal · Cup ${pick + 1}`}
        busyLabel="Shuffling…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
