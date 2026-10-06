"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_HOUSE_EDGE,
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  type DiceDirection,
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
  roll?: number;
  won?: boolean;
  multiplier?: number;
  payout?: number;
  profit?: number;
  balanceAfter?: number;
};

export default function DicePage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [spinShow, setSpinShow] = useState(50);

  const winChance = useMemo(() => {
    const raw = direction === "under" ? target : 100 - target;
    return Math.max(1, Math.min(98, raw));
  }, [target, direction]);

  const multiplier = useMemo(() => {
    const p = winChance / 100;
    if (p <= 0) return 1.01;
    return Math.max(
      1.01,
      Math.floor(((1 / p) * (1 - CASINO_HOUSE_EDGE)) * 10000) / 10000
    );
  }, [winChance]);

  const potential = Math.floor(stake * multiplier * 100) / 100;

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

  // Scramble the big number while rolling
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      setSpinShow(Math.floor(Math.random() * 10000) / 100);
    }, 50);
    return () => clearInterval(t);
  }, [busy]);

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
        body: JSON.stringify({ game: "dice", stake, target, direction }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");
      await new Promise((r) => setTimeout(r, 450));
      setLast(data);
      if (typeof data.roll === "number") setSpinShow(data.roll);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
      if (typeof data.roll === "number") {
        setHistory((h) => [data.roll!, ...h].slice(0, 8));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const rule =
    direction === "under"
      ? `Win if roll is under ${target}`
      : `Win if roll is over ${target}`;

  const resultText =
    last && typeof last.roll === "number"
      ? last.won
        ? `${last.roll.toFixed(2)} is ${direction} ${target} · +${chips(last.profit ?? 0)} · ${last.multiplier?.toFixed(2)}x`
        : `${last.roll.toFixed(2)} is not ${direction} ${target} · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Dice" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {/* Big decimal roll — NOT a 6-sided die */}
      <div className="mb-3 flex flex-col items-center rounded-2xl border border-ink-muted/15 bg-surface py-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          Roll (0.00 – 99.99)
        </p>
        <p
          className={`mt-1 text-5xl font-black tabular-nums tracking-tight ${
            busy
              ? "text-ink-muted"
              : last?.won === true
                ? "text-emerald-600"
                : last?.won === false
                  ? "text-red-500"
                  : "text-ink"
          }`}
        >
          {busy
            ? spinShow.toFixed(2)
            : last?.roll != null
              ? last.roll.toFixed(2)
              : "—.—"}
        </p>
        <p className="mt-2 text-xs font-medium text-ink-muted">{rule}</p>
      </div>

      {history.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {history.map((r, i) => (
            <span
              key={`${r}-${i}`}
              className="shrink-0 rounded-lg bg-ink-muted/10 px-2 py-1 text-[11px] font-bold tabular-nums text-ink"
            >
              {r.toFixed(2)}
            </span>
          ))}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["under", "over"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded-xl py-2.5 text-sm font-bold capitalize ${
              direction === d
                ? "bg-brand text-white"
                : "border border-ink-muted/15 bg-surface text-ink"
            }`}
          >
            Roll {d}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-ink-muted/15 bg-surface p-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase text-ink-muted">
              Target
            </p>
            <p className="text-3xl font-extrabold tabular-nums">{target}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase text-ink-muted">
              Pays
            </p>
            <p className="text-xl font-extrabold tabular-nums text-brand">
              {multiplier.toFixed(2)}x
            </p>
          </div>
        </div>

        <div className="relative h-3 overflow-hidden rounded-full bg-ink-muted/15">
          <div
            className={`absolute inset-y-0 ${
              direction === "under"
                ? "left-0 bg-emerald-500"
                : "right-0 bg-emerald-500"
            }`}
            style={{
              width: `${direction === "under" ? target : 100 - target}%`,
            }}
          />
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow"
            style={{ left: `${target}%` }}
          />
        </div>
        <input
          type="range"
          min={2}
          max={98}
          step={1}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="mt-3 w-full accent-emerald-600"
        />
        <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
          <span>Win chance {winChance.toFixed(0)}%</span>
          <span>
            {direction === "under" ? `roll < ${target}` : `roll > ${target}`}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <StakeBar
          stake={stake}
          setStake={setStake}
          balance={balance}
          min={CASINO_MIN_STAKE}
          max={CASINO_MAX_STAKE}
          potentialLabel={`Win ${chips(potential)}`}
        />
      </div>

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={
          balance == null || balance < stake || stake < CASINO_MIN_STAKE
        }
        label="Roll"
        busyLabel="Rolling…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
              }
