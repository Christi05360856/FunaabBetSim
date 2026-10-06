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

const SIDES: { id: PenaltySide; label: string; arrow: string }[] = [
  { id: "left", label: "Left", arrow: "◀" },
  { id: "center", label: "Center", arrow: "▲" },
  { id: "right", label: "Right", arrow: "▶" },
];

function keeperOffset(side: PenaltySide | null, animating: boolean): string {
  if (!side || animating) return "translateX(-50%)";
  if (side === "left") return "translateX(calc(-50% - 72px))";
  if (side === "right") return "translateX(calc(-50% + 72px))";
  return "translateX(-50%)";
}

function ballStyle(
  shot: PenaltySide | null,
  phase: "idle" | "fly" | "done"
): Record<string, string> {
  if (phase === "idle" || !shot) {
    return { bottom: "8%", left: "50%", transform: "translateX(-50%) scale(1)" };
  }
  const x =
    shot === "left" ? "28%" : shot === "right" ? "72%" : "50%";
  if (phase === "fly") {
    return {
      bottom: "42%",
      left: x,
      transform: "translateX(-50%) scale(0.85)",
      transition: "all 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)",
    };
  }
  return {
    bottom: "58%",
    left: x,
    transform: "translateX(-50%) scale(0.7)",
    transition: "all 0.25s ease-out",
  };
}

export default function PenaltyPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [shot, setShot] = useState<PenaltySide>("center");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [phase, setPhase] = useState<"idle" | "fly" | "done">("idle");
  const [showKeeper, setShowKeeper] = useState<PenaltySide | null>(null);

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
    setShowKeeper(null);
    setPhase("fly");
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
      await new Promise((r) => setTimeout(r, 400));
      setShowKeeper(data.keeper ?? null);
      setPhase("done");
      await new Promise((r) => setTimeout(r, 200));
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setPhase("idle");
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  function resetScene() {
    setPhase("idle");
    setShowKeeper(null);
    setLast(null);
  }

  const resultText =
    last?.shot && last?.keeper
      ? last.won
        ? `GOAL! Shot ${last.shot} · Keeper ${last.keeper} · Payout ${chips(last.payout ?? 0)}`
        : `SAVED · Shot ${last.shot} · Keeper ${last.keeper} · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Penalty" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {/* Pitch + goal */}
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-ink-muted/15">
        {/* Sky */}
        <div className="h-8 bg-gradient-to-b from-sky-300/50 to-sky-200/30 dark:from-sky-900/40 dark:to-sky-950/20" />
        {/* Goal area */}
        <div className="relative h-44 bg-gradient-to-b from-emerald-600/80 to-emerald-700/90">
          {/* Goal frame */}
          <div className="absolute left-1/2 top-3 h-[72%] w-[78%] -translate-x-1/2 rounded-t-lg border-[3px] border-white/90 bg-white/10 shadow-inner">
            {/* Net lines */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 10px, rgba(255,255,255,0.35) 10px, rgba(255,255,255,0.35) 11px), repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,255,255,0.35) 10px, rgba(255,255,255,0.35) 11px)",
              }}
            />
          </div>

          {/* Keeper */}
          <div
            className="absolute bottom-[38%] left-1/2 z-10 text-4xl transition-transform duration-300 ease-out"
            style={{
              transform: keeperOffset(showKeeper, phase === "fly" && !showKeeper),
            }}
            aria-hidden
          >
            🧤
          </div>

          {/* Ball */}
          <div
            className="absolute z-20 text-3xl"
            style={ballStyle(phase === "idle" ? null : shot, phase)}
            aria-hidden
          >
            ⚽
          </div>

          {/* Result stamp */}
          {last && phase === "done" && (
            <div
              className={`absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-1.5 text-sm font-black tracking-wide text-white shadow-lg ${
                last.won ? "bg-emerald-500" : "bg-red-500"
              }`}
            >
              {last.won ? "GOAL!" : "SAVED"}
            </div>
          )}
        </div>
        {/* Grass strip */}
        <div className="h-6 bg-emerald-800/90" />
      </div>

      <p className="mb-2 text-center text-[11px] text-ink-muted">
        Aim your shot · pays {PENALTY_MULT.toFixed(2)}x if the keeper misses
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {SIDES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setShot(s.id);
              if (phase === "done") resetScene();
            }}
            className={`flex flex-col items-center rounded-xl py-3 text-sm font-bold disabled:opacity-60 ${
              shot === s.id
                ? "bg-brand text-white shadow-sm"
                : "border border-ink-muted/15 bg-surface text-ink"
            }`}
          >
            <span className="text-base leading-none">{s.arrow}</span>
            <span className="mt-1">{s.label}</span>
          </button>
        ))}
      </div>

      <StakeBar
        stake={stake}
        setStake={setStake}
        balance={balance}
        min={CASINO_MIN_STAKE}
        max={CASINO_MAX_STAKE}
        potentialLabel={`Payout ${chips(
          Math.floor(stake * PENALTY_MULT * 100) / 100
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
        label={phase === "done" ? `Shoot again · ${shot}` : `Shoot · ${shot}`}
        busyLabel="Shooting…"
        onClick={() => {
          if (phase === "done") resetScene();
          void play();
        }}
      />
    </CasinoShell>
  );
}
