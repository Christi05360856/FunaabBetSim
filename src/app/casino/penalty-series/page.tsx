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
  completed?: boolean;
  multiplier?: number;
  payout?: number;
  profit?: number;
  won?: boolean;
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
): React.CSSProperties {
  if (phase === "idle" || !shot) {
    return {
      bottom: "8%",
      left: "50%",
      transform: "translateX(-50%) scale(1)",
    };
  }

  const x = shot === "left" ? "28%" : shot === "right" ? "72%" : "50%";

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

export default function PenaltySeriesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [shots, setShots] = useState<PenaltySide[]>(
    Array(PENALTY_SERIES_SHOTS).fill("center") as PenaltySide[]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [phase, setPhase] = useState<"idle" | "fly" | "done">("idle");
  const [activeShot, setActiveShot] = useState(0);
  const [revealed, setRevealed] = useState(0);
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

  function setShot(side: PenaltySide) {
    if (busy) return;
    setLast(null);
    setShots((prev) => {
      const next = [...prev];
      next[activeShot] = side;
      return next;
    });
  }

  async function play() {
    if (!user || busy) return;

    setBusy(true);
    setErr(null);
    setLast(null);
    setShowKeeper(null);
    setRevealed(0);
    setPhase("fly");

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "penalty-series",
          stake,
          shots,
        }),
      });

      const data: PlayRes = await res.json();
      if (!res.ok) throw new Error(data.error || "Play failed");

      const results = data.results ?? [];
      const keepers = data.keepers ?? [];

      // Reveal one penalty at a time. A miss ends the visual sequence immediately.
      for (let i = 0; i < results.length; i++) {
        setActiveShot(i);
        setShowKeeper(null);
        setPhase("fly");
        await new Promise((r) => setTimeout(r, 520));
        setShowKeeper(keepers[i] ?? null);
        setPhase("done");
        setRevealed(i + 1);
        await new Promise((r) => setTimeout(r, 430));

        if (!results[i]) break;
      }

      setLast(data);
      if (typeof data.balanceAfter === "number") {
        setBalance(data.balanceAfter);
      }
    } catch (e) {
      setPhase("idle");
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLast(null);
    setPhase("idle");
    setShowKeeper(null);
    setRevealed(0);
    setActiveShot(0);
    setShots(Array(PENALTY_SERIES_SHOTS).fill("center") as PenaltySide[]);
  }

  const failed = last && !last.completed;
  const completed = last?.completed;

  return (
    <CasinoShell title="Penalty Series" balance={balance}>
      <div className="mb-3 flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-xs">
        <span className="font-bold text-ink">5 Consecutive Penalties</span>
        <span className="font-bold text-brand">
          {revealed}/{PENALTY_SERIES_SHOTS}
        </span>
      </div>

      {/* Same visual language as the normal Penalty game */}
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-ink-muted/15">
        <div className="h-8 bg-gradient-to-b from-sky-300/50 to-sky-200/30 dark:from-sky-900/40 dark:to-sky-950/20" />

        <div className="relative h-48 bg-gradient-to-b from-emerald-600/80 to-emerald-700/90">
          <div className="absolute left-1/2 top-3 h-[72%] w-[78%] -translate-x-1/2 rounded-t-lg border-[3px] border-white/90 bg-white/10 shadow-inner">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 10px, rgba(255,255,255,0.35) 10px, rgba(255,255,255,0.35) 11px), repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,255,255,0.35) 10px, rgba(255,255,255,0.35) 11px)",
              }}
            />
          </div>

          <div
            className="absolute bottom-[38%] left-1/2 z-10 text-4xl transition-transform duration-300 ease-out"
            style={{
              transform: keeperOffset(
                showKeeper,
                phase === "fly" && !showKeeper
              ),
            }}
            aria-hidden
          >
            🧤
          </div>

          <div
            className="absolute z-20 text-3xl"
            style={ballStyle(shots[activeShot], phase)}
            aria-hidden
          >
            ⚽
          </div>

          {last && phase === "done" && (
            <div
              className={`absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-1.5 text-sm font-black tracking-wide text-white shadow-lg ${
                completed ? "bg-emerald-500" : "bg-red-500"
              }`}
            >
              {completed ? "5/5 — CASH OUT!" : `${last.goals ?? 0}/5 — FAILED`}
            </div>
          )}
        </div>

        <div className="h-6 bg-emerald-800/90" />
      </div>

      {/* Progress */}
      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {Array.from({ length: PENALTY_SERIES_SHOTS }, (_, i) => {
          const result = last?.results?.[i];
          const active = i === activeShot && busy;
          return (
            <div
              key={i}
              className={`h-2 rounded-full ${
                result === true
                  ? "bg-emerald-500"
                  : result === false
                    ? "bg-red-500"
                    : active
                      ? "bg-brand"
                      : "bg-ink-muted/15"
              }`}
            />
          );
        })}
      </div>

      <p className="mb-3 text-center text-[11px] text-ink-muted">
        Score all 5 consecutive penalties. One save ends the attempt — no
        partial payout.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {SIDES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => setShot(s.id)}
            className={`flex flex-col items-center rounded-xl py-3 text-sm font-bold disabled:opacity-60 ${
              shots[activeShot] === s.id
                ? "bg-brand text-white shadow-sm"
                : "border border-ink-muted/15 bg-surface text-ink"
            }`}
          >
            <span className="text-base leading-none">{s.arrow}</span>
            <span className="mt-1">{s.label}</span>
          </button>
        ))}
      </div>

      <p className="mb-2 text-center text-[10px] font-semibold text-ink-muted">
        Choosing for Shot {Math.min(activeShot + 1, PENALTY_SERIES_SHOTS)} of{" "}
        {PENALTY_SERIES_SHOTS}
      </p>

      <div className="mb-3 flex flex-wrap justify-center gap-2 text-[10px] text-ink-muted">
        <span className="rounded-full bg-brand/10 px-2 py-0.5 font-bold text-brand">
          5/5 → {PENALTY_SERIES_MULT[PENALTY_SERIES_SHOTS]}x
        </span>
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-bold text-red-600">
          Any miss → 0x
        </span>
      </div>

      {last && (
        <ResultBanner
          won={!!last.won}
          text={
            last.won
              ? `5/5 GOALS · +${chips(last.profit ?? 0)} · ${last.multiplier}x`
              : `${last.goals ?? 0}/5 GOALS · −${chips(stake)}`
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
        <p className="mt-3 text-center text-xs font-medium text-red-600">
          {err}
        </p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={
          balance == null ||
          balance < stake ||
          stake < CASINO_MIN_STAKE
        }
        label={last ? "Start New Series" : "Take Series"}
        busyLabel="Taking penalties…"
        onClick={() => {
          if (last) reset();
          else void play();
        }}
      />
    </CasinoShell>
  );
        }
