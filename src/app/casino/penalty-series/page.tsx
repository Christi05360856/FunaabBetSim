"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  type PenaltySide,
} from "@/types/casino";
import { PENALTY_LADDER } from "@/lib/casino/penaltyLadder";
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

const MAX_SHOTS = PENALTY_LADDER.length;

const SIDES: { id: PenaltySide; label: string; arrow: string }[] = [
  { id: "left", label: "Left", arrow: "◀" },
  { id: "center", label: "Center", arrow: "▲" },
  { id: "right", label: "Right", arrow: "▶" },
];

type Phase = "idle" | "fly" | "done";

function keeperOffset(side: PenaltySide | null, animating: boolean): string {
  if (!side || animating) return "translateX(-50%)";
  if (side === "left") return "translateX(calc(-50% - 72px))";
  if (side === "right") return "translateX(calc(-50% + 72px))";
  return "translateX(-50%)";
}

function ballStyle(shot: PenaltySide | null, phase: Phase): CSSProperties {
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

  // How many goals in a row you are going for (1..5)
  const [target, setTarget] = useState(MAX_SHOTS);
  const [picks, setPicks] = useState<(PenaltySide | null)[]>(
    Array(MAX_SHOTS).fill(null)
  );
  const [pickIndex, setPickIndex] = useState(0);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeShot, setActiveShot] = useState(0);
  const [scored, setScored] = useState(0);
  const [missedAt, setMissedAt] = useState<number | null>(null);
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

  const chosen = picks
    .slice(0, target)
    .filter((p): p is PenaltySide => p !== null);
  const ready = chosen.length === target;
  const mult = PENALTY_LADDER[target - 1] ?? 0;
  const potential = Math.floor(stake * mult * 100) / 100;
  const completed = !!last?.completed;

  function selectTarget(n: number) {
    if (busy || last) return;
    setTarget(n);
    setPickIndex((cur) => Math.min(cur, n - 1));
  }

  function choose(side: PenaltySide) {
    if (busy || last) return;
    setPicks((prev) => {
      const next = [...prev];
      next[pickIndex] = side;
      return next;
    });
    const nextEmpty = picks.findIndex(
      (p, i) => i < target && i !== pickIndex && p === null
    );
    if (nextEmpty !== -1) setPickIndex(nextEmpty);
  }

  async function play() {
    if (!user || busy || !ready) return;

    setBusy(true);
    setErr(null);
    setLast(null);
    setShowKeeper(null);
    setScored(0);
    setMissedAt(null);
    setActiveShot(0);
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
          shots: chosen,
        }),
      });

      const data: PlayRes = await res.json();
      if (!res.ok) throw new Error(data.error || "Play failed");

      const results = data.results ?? [];
      const keepers = data.keepers ?? [];

      // Reveal one penalty at a time. A save ends the run immediately.
      let goalsSoFar = 0;
      for (let i = 0; i < results.length; i++) {
        setActiveShot(i);
        setShowKeeper(null);
        setPhase("fly");
        await new Promise((r) => setTimeout(r, 520));
        setShowKeeper(keepers[i] ?? null);
        setPhase("done");

        if (results[i]) {
          goalsSoFar += 1;
          setScored(goalsSoFar);
        } else {
          setMissedAt(i);
        }
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
    setScored(0);
    setMissedAt(null);
    setActiveShot(0);
    setPickIndex(0);
    setPicks(Array(MAX_SHOTS).fill(null));
  }

  const ballShot: PenaltySide | null =
    phase === "idle" ? null : (picks[activeShot] ?? null);

  return (
    <CasinoShell title="Penalty Series" balance={balance}>
      {/* Ladder: tap a step to choose your target */}
      <div className="mb-3 rounded-2xl bg-surface px-2 py-3">
        <div className="relative grid grid-cols-5">
          <div className="absolute left-[10%] right-[10%] top-[11px] h-1.5 rounded-full bg-ink-muted/15" />
          <div
            className="absolute left-[10%] top-[11px] h-1.5 rounded-full bg-emerald-500 transition-all duration-300"
            style={{
              width: `${(scored <= 1 ? 0 : (scored - 1) / (MAX_SHOTS - 1)) * 80}%`,
            }}
          />
          {PENALTY_LADDER.map((m, i) => {
            const isGoal = i < scored;
            const isMiss = missedAt === i;
            const isActive = busy && i === activeShot && !isGoal && !isMiss;
            const isTarget = !busy && !last && i === target - 1;
            const inRange = !busy && !last && i < target - 1;
            const dim = i >= target;
            return (
              <button
                key={i}
                type="button"
                disabled
                onClick={() => selectTarget(i + 1)}
                className={`relative z-10 flex flex-col items-center gap-1 disabled:cursor-default ${
                  dim ? "opacity-40" : ""
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs ${
                    isGoal
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isMiss
                        ? "border-red-500 bg-red-500 text-white"
                        : isActive
                          ? "border-brand bg-white"
                          : isTarget
                            ? "border-brand bg-brand/20"
                            : inRange
                              ? "border-brand/40 bg-surface"
                              : "border-ink-muted/30 bg-surface"
                  }`}
                >
                  {isGoal ? "⚽" : isMiss ? "✕" : ""}
                </span>
                <span
                  className={`text-[11px] font-black ${
                    isGoal
                      ? "text-emerald-600"
                      : isMiss
                        ? "text-red-500"
                        : isTarget
                          ? "text-brand"
                          : "text-ink-muted"
                  }`}
                >
                  x{m}
                </span>
              </button>
            );
          })}
        </div>

        {!last && (
          <p className="mt-2 text-center text-[11px] font-semibold text-ink-muted">
            Goal: score {target} in a row →{" "}
            <span className="text-brand">x{mult}</span> · win {chips(potential)}
          </p>
        )}
      </div>

      {/* Pitch */}
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
            style={ballStyle(ballShot, phase)}
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
              {completed
                ? `${target}/${target} — CASH OUT!`
                : `${last.goals ?? 0}/${target} — SAVED!`}
            </div>
          )}
        </div>

        <div className="h-6 bg-emerald-800/90" />
      </div>

      {/* Aim picker */}
      {!last && (
        <>
          <div className="mb-2 flex justify-center gap-1.5">
            {picks.slice(0, target).map((p, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => setPickIndex(i)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold disabled:opacity-60 ${
                  i === pickIndex
                    ? "bg-brand text-white"
                    : p
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-ink-muted/10 text-ink-muted"
                }`}
              >
                {i + 1}
                {p ? ` ${p === "left" ? "◀" : p === "right" ? "▶" : "▲"}` : ""}
              </button>
            ))}
          </div>

          <p className="mb-2 text-center text-[11px] font-semibold text-ink-muted">
            Aim shot {pickIndex + 1} of {target} · {chosen.length}/{target}{" "}
            chosen
          </p>

          <div className="mb-4 grid grid-cols-3 gap-2">
            {SIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => choose(s.id)}
                className={`flex flex-col items-center rounded-xl py-3 text-sm font-bold disabled:opacity-60 ${
                  picks[pickIndex] === s.id
                    ? "bg-brand text-white shadow-sm"
                    : "border border-ink-muted/15 bg-surface text-ink"
                }`}
              >
                <span className="text-base leading-none">{s.arrow}</span>
                <span className="mt-1">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mb-3 text-center text-[11px] text-ink-muted">
        Score every penalty up to your target. One save and the run is lost.
      </p>

      {last && (
        <ResultBanner
          won={!!last.won}
          text={
            last.won
              ? `${target}/${target} GOALS · +${chips(last.profit ?? 0)} · ${last.multiplier}x`
              : `${last.goals ?? 0}/${target} GOALS · −${chips(stake)}`
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
          last
            ? false
            : !ready ||
              balance == null ||
              balance < stake ||
              stake < CASINO_MIN_STAKE
        }
        label={
          last
            ? "Start New Series"
            : ready
              ? "Take Series"
              : `Aim all ${target} shot${target > 1 ? "s" : ""}`
        }
        busyLabel="Taking penalties…"
        onClick={() => {
          if (last) reset();
          else void play();
        }}
      />
    </CasinoShell>
  );
    }
