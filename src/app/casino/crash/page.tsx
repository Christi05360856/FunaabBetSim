"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";
import {
  bindGlobalAudioUnlock,
  sfxBet,
  sfxCashout,
  sfxCrash,
  sfxFlyTick,
  unlockAudio,
} from "@/lib/casino/sounds";

type Snapshot = {
  index: number;
  phase: "betting" | "flying" | "crashed";
  flyAt: number;
  endsAt: number;
  crashPoint: number | null;
  growth: number;
  offset: number;
};

type Mine = {
  joined: boolean;
  stake?: number;
  cashedOut?: boolean;
  cashoutMult?: number | null;
  payout?: number | null;
};

function vibrate(ms: number) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* not supported */
  }
}

export default function CrashPage() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [mine, setMine] = useState<Mine>({ joined: false });
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);
  const lastIndex = useRef<number | null>(null);
  const lastFlySfx = useRef(0);
  const crashSfxPlayed = useRef(false);

  const load = useCallback(
    async (withMine: boolean) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/casino/crash-round${withMine ? "?mine=1" : ""}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) return;
        setSnap({
          index: data.index,
          phase: data.phase,
          flyAt: data.flyAt,
          endsAt: data.endsAt,
          crashPoint: data.crashPoint,
          growth: data.growth,
          offset: data.serverNow - Date.now(),
        });
        if (withMine) {
          if (typeof data.balance === "number") setBalance(data.balance);
          if (data.mine) setMine(data.mine as Mine);
        }
      } catch {
        /* keep last known state */
      }
    },
    [user]
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  // Unlock Web Audio on first tap (required on mobile)
  useEffect(() => {
    bindGlobalAudioUnlock();
  }, []);

  // Poll: faster while flying/crashed so next round appears quickly (HTTP only, no Firestore listeners)
  useEffect(() => {
    const fast = snap?.phase === "flying" || snap?.phase === "crashed";
    const id = setInterval(() => void load(false), fast ? 250 : 800);
    return () => clearInterval(id);
  }, [load, snap?.phase]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!snap) return;
    if (lastIndex.current !== null && lastIndex.current !== snap.index) {
      setBanner(null);
      setWon(null);
      setErr(null);
      setMine({ joined: false });
      crashSfxPlayed.current = false;
      void load(true);
    }
    lastIndex.current = snap.index;
  }, [snap, load]);

  void tick;
  const serverNow = Date.now() + (snap?.offset ?? 0);
  let phase: "betting" | "flying" | "crashed" = snap?.phase ?? "betting";
  let multiplier = 1;
  if (snap) {
    if (snap.phase === "crashed" && snap.crashPoint != null) {
      multiplier = snap.crashPoint;
    } else if (serverNow >= snap.flyAt) {
      phase = "flying";
      multiplier = Math.exp(snap.growth * ((serverNow - snap.flyAt) / 1000));
      if (snap.crashPoint != null && multiplier >= snap.crashPoint) {
        multiplier = snap.crashPoint;
        phase = "crashed";
      }
    } else {
      phase = "betting";
    }
  }
  const secondsToFly = snap
    ? Math.max(0, Math.ceil((snap.flyAt - serverNow) / 1000))
    : 0;

  // Sparse fly ticks (not every frame)
  useEffect(() => {
    if (phase !== "flying") return;
    const now = Date.now();
    if (now - lastFlySfx.current > 400) {
      lastFlySfx.current = now;
      sfxFlyTick(multiplier);
    }
  }, [phase, multiplier]);

  useEffect(() => {
    if (phase === "crashed" && !crashSfxPlayed.current) {
      crashSfxPlayed.current = true;
      sfxCrash();
    }
  }, [phase]);

  const cashoutValue =
    mine.joined && mine.stake
      ? Math.floor(mine.stake * multiplier * 100) / 100
      : 0;

  const planeProgress =
    phase === "betting"
      ? 0
      : Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(100));
  const planeBottom = 8 + planeProgress * 72;
  const planeRight = 8 + planeProgress * 55;

  async function post(body: Record<string, unknown>) {
    if (!user) throw new Error("Sign in required");
    const token = await user.getIdToken();
    const res = await fetch("/api/casino/crash-cashout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function join() {
    if (!snap || busy) return;
    unlockAudio();
    setBusy(true);
    setErr(null);
    try {
      const data = await post({ action: "join", stake, roundIndex: snap.index });
      setMine({ joined: true, stake: data.stake, cashedOut: false });
      if (typeof data.balance === "number") setBalance(data.balance);
      sfxBet();
      vibrate(20);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (!snap || busy) return;
    unlockAudio();
    setBusy(true);
    setErr(null);
    try {
      const data = await post({ action: "cashout", roundIndex: snap.index });
      setMine((m) => ({
        ...m,
        cashedOut: true,
        cashoutMult: data.multiplier,
        payout: data.payout,
      }));
      setWon(true);
      const total =
        typeof data.payout === "number"
          ? data.payout
          : Math.floor((mine.stake ?? 0) * (data.multiplier ?? 1) * 100) / 100;
      setBanner(`Cashed out at ${data.multiplier}x · ${chips(total)}`);
      if (typeof data.balance === "number") setBalance(data.balance);
      sfxCashout();
      vibrate(40);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      void load(true);
    } finally {
      setBusy(false);
    }
  }

  const lost = phase === "crashed" && mine.joined && !mine.cashedOut;

  return (
    <CasinoShell title="Crash" balance={balance}>
      <div className="relative mb-4 flex h-52 flex-col items-center justify-center overflow-hidden rounded-2xl border border-ink-muted/12 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-white" />
          <div className="absolute left-[70%] top-[28%] h-1.5 w-1.5 rounded-full bg-white/80" />
          <div className="absolute left-[40%] top-[12%] h-1 w-1 rounded-full bg-white/60" />
          <div className="absolute left-[85%] top-[55%] h-1 w-1 rounded-full bg-white/70" />
        </div>

        {(phase === "flying" || phase === "crashed") && (
          <div
            className="pointer-events-none absolute transition-all duration-100 ease-linear"
            style={{
              bottom: `${planeBottom}%`,
              left: `${planeRight}%`,
              transform:
                phase === "crashed"
                  ? "rotate(45deg) scale(0.85)"
                  : "rotate(-12deg)",
              opacity: phase === "crashed" ? 0.35 : 1,
            }}
            aria-hidden
          >
            <span className="text-4xl drop-shadow-lg">✈️</span>
          </div>
        )}
        {phase === "betting" && (
          <div
            className="pointer-events-none absolute bottom-4 left-6 text-3xl opacity-70"
            aria-hidden
          >
            ✈️
          </div>
        )}

        <p className="relative z-10 text-[10px] font-bold uppercase tracking-wide text-white/60">
          Round #{snap?.index ?? "—"} ·{" "}
          {phase === "betting"
            ? `starts in ${secondsToFly}s`
            : phase === "flying"
              ? "flying"
              : "crashed"}
        </p>
        <p
          className={`relative z-10 mt-2 text-5xl font-extrabold tabular-nums ${
            phase === "crashed" ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {multiplier.toFixed(2)}x
        </p>
        {phase === "crashed" && snap?.crashPoint != null && (
          <p className="relative z-10 mt-1 text-xs text-white/50">
            Crashed at {snap.crashPoint.toFixed(2)}x
          </p>
        )}
        {mine.joined && (
          <p className="relative z-10 mt-1 text-[11px] font-semibold text-white/70">
            Your stake: {chips(mine.stake ?? 0)}
            {mine.cashedOut && mine.cashoutMult
              ? ` · cashed at ${mine.cashoutMult}x`
              : ""}
          </p>
        )}
      </div>

      <ResultBanner
        won={lost ? false : won}
        text={lost ? "Crashed — stake lost" : banner}
      />

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

      {phase === "betting" && !mine.joined && (
        <PrimaryBtn
          busy={busy}
          disabled={
            balance == null || balance < stake || stake < CASINO_MIN_STAKE
          }
          label="Join round"
          busyLabel="Joining…"
          onClick={() => void join()}
        />
      )}
      {phase === "betting" && mine.joined && (
        <p className="mt-4 text-center text-xs font-semibold text-emerald-600">
          You are in. Cash out before it crashes.
        </p>
      )}
      {phase === "flying" && mine.joined && !mine.cashedOut && (
        <button
          type="button"
          disabled={busy || multiplier < 1.01}
          onClick={() => void cashout()}
          className="mt-4 w-full rounded-2xl bg-amber-500 py-4 text-center text-base font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : `Cash out · ${chips(cashoutValue)}`}
          <span className="mt-0.5 block text-xs font-semibold opacity-90">
            {multiplier.toFixed(2)}x
          </span>
        </button>
      )}
      {phase === "flying" && !mine.joined && (
        <p className="mt-4 text-center text-xs text-ink-muted">
          Round in progress. You can join the next one.
        </p>
      )}
    </CasinoShell>
  );
          }
      
