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

type Snapshot = {
  index: number;
  phase: "betting" | "flying" | "crashed";
  flyAt: number;
  endsAt: number;
  crashPoint: number | null;
  growth: number;
  /** server time minus this phone's clock, so phases match the server */
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
        /* keep the last known state */
      }
    },
    [user]
  );

  // First load, with the player's own stake and chips.
  useEffect(() => {
    void load(true);
  }, [load]);

  // Cheap clock-only poll. Faster while the multiplier is climbing.
  useEffect(() => {
    const fast = snap?.phase === "flying";
    const id = setInterval(() => void load(false), fast ? 500 : 1000);
    return () => clearInterval(id);
  }, [load, snap?.phase]);

  // Smooth animation between polls.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  // A new round started: reset the banner and fetch this round's stake.
  useEffect(() => {
    if (!snap) return;
    if (lastIndex.current !== null && lastIndex.current !== snap.index) {
      setBanner(null);
      setWon(null);
      setErr(null);
      void load(true);
    }
    lastIndex.current = snap.index;
  }, [snap, load]);

  // Reading `tick` keeps the display moving.
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
    } else {
      phase = "betting";
    }
  }
  const secondsToFly = snap ? Math.max(0, Math.ceil((snap.flyAt - serverNow) / 1000)) : 0;

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
    setBusy(true);
    setErr(null);
    try {
      const data = await post({ action: "join", stake, roundIndex: snap.index });
      setMine({ joined: true, stake: data.stake, cashedOut: false });
      if (typeof data.balance === "number") setBalance(data.balance);
      vibrate(20);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (!snap || busy) return;
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
      setBanner(`Cashed out at ${data.multiplier}x · +${chips(data.profit ?? 0)}`);
      if (typeof data.balance === "number") setBalance(data.balance);
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
      <div className="mb-4 flex h-44 flex-col items-center justify-center rounded-2xl border border-ink-muted/12 bg-surface">
        <p className="text-[10px] font-bold uppercase text-ink-muted">
          Round #{snap?.index ?? "—"} ·{" "}
          {phase === "betting"
            ? `starts in ${secondsToFly}s`
            : phase === "flying"
              ? "flying"
              : "crashed"}
        </p>
        <p
          className={`mt-2 text-5xl font-extrabold tabular-nums ${
            phase === "crashed" ? "text-red-500" : "text-brand"
          }`}
        >
          {multiplier.toFixed(2)}x
        </p>
        {phase === "crashed" && snap?.crashPoint != null && (
          <p className="mt-1 text-xs text-ink-muted">
            Crashed at {snap.crashPoint.toFixed(2)}x
          </p>
        )}
        {mine.joined && (
          <p className="mt-1 text-[11px] font-semibold text-ink-muted">
            Your stake: {chips(mine.stake ?? 0)}
            {mine.cashedOut && mine.cashoutMult
              ? ` · cashed at ${mine.cashoutMult}x`
              : ""}
          </p>
        )}
      </div>

      <ResultBanner won={lost ? false : won} text={lost ? "Crashed — stake lost" : banner} />

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
          disabled={balance == null || balance < stake || stake < CASINO_MIN_STAKE}
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
        <PrimaryBtn
          busy={busy}
          disabled={multiplier < 1.01}
          label={`Cash out · ${multiplier.toFixed(2)}x`}
          busyLabel="…"
          onClick={() => void cashout()}
        />
      )}
      {phase === "flying" && !mine.joined && (
        <p className="mt-4 text-center text-xs text-ink-muted">
          Round in progress. You can join the next one.
        </p>
      )}
    </CasinoShell>
  );
            }
      
