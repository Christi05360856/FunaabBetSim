"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_HOUSE_EDGE,
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
} from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";

function previewMult(mineCount: number, revealCount: number): number {
  if (revealCount < 1) return 1;
  let prob = 1;
  for (let i = 0; i < revealCount; i++) {
    const safe = MINES_GRID - mineCount - i;
    const left = MINES_GRID - i;
    if (safe <= 0 || left <= 0) return 1.01;
    prob *= safe / left;
  }
  if (prob <= 0) return 1.01;
  return Math.max(1.01, Math.floor(((1 / prob) * (1 - CASINO_HOUSE_EDGE)) * 10000) / 10000);
}

type PlayRes = {
  ok?: boolean;
  error?: string;
  picks?: number[];
  mines?: number[];
  hit?: number | null;
  won?: boolean;
  multiplier?: number;
  profit?: number;
  balanceAfter?: number;
};

export default function MinesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [mineCount, setMineCount] = useState(3);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);

  const mult = useMemo(
    () => previewMult(mineCount, selected.size || 1),
    [mineCount, selected.size]
  );
  const potential =
    selected.size > 0
      ? Math.floor(stake * mult * 100) / 100
      : 0;

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

  function toggle(i: number) {
    if (busy) return;
    setLast(null);
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else if (n.size < MINES_GRID - mineCount) n.add(i);
      return n;
    });
  }

  async function play() {
    if (!user || busy || selected.size < 1) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/play", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "mines",
          stake,
          mineCount,
          picks: [...selected],
        }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");
      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const revealed = last?.mines != null;
  const resultText =
    last != null
      ? last.won
        ? `Safe · +${chips(last.profit ?? 0)} · ${last.multiplier?.toFixed(2)}x`
        : `Mine hit · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Mines" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {/* Mine count */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-ink-muted/15 bg-surface px-3 py-2">
        <span className="text-xs font-semibold text-ink-muted">Mines</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMineCount((c) => Math.max(MINES_MIN, c - 1));
              setSelected(new Set());
              setLast(null);
            }}
            className="h-8 w-8 rounded-lg bg-ink-muted/10 text-sm font-bold"
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-extrabold tabular-nums">
            {mineCount}
          </span>
          <button
            type="button"
            onClick={() => {
              setMineCount((c) => Math.min(MINES_MAX, c + 1));
              setSelected(new Set());
              setLast(null);
            }}
            className="h-8 w-8 rounded-lg bg-ink-muted/10 text-sm font-bold"
          >
            +
          </button>
        </div>
        <span className="text-xs font-bold text-brand">
          {selected.size > 0 ? `${mult.toFixed(2)}x` : "—"}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: MINES_GRID }, (_, i) => {
          const isPick = selected.has(i);
          const isMine = revealed && last?.mines?.includes(i);
          const isSafe =
            revealed && last?.picks?.includes(i) && !isMine;
          return (
            <button
              key={i}
              type="button"
              disabled={busy || revealed}
              onClick={() => toggle(i)}
              className={`aspect-square rounded-xl text-sm font-bold transition active:scale-95 ${
                isMine
                  ? "bg-red-500/90 text-white"
                  : isSafe
                    ? "bg-emerald-500/90 text-white"
                    : isPick
                      ? "bg-brand text-white"
                      : "border border-ink-muted/15 bg-surface text-ink-muted"
              }`}
            >
              {isMine ? "💣" : isSafe ? "💎" : isPick ? "✓" : ""}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-ink-muted">
        Tap tiles to open · {selected.size} selected
      </p>

      <div className="mt-3">
        <StakeBar
          stake={stake}
          setStake={setStake}
          balance={balance}
          min={CASINO_MIN_STAKE}
          max={CASINO_MAX_STAKE}
          potentialLabel={
            selected.size > 0 ? `Win ${chips(potential)}` : "Pick tiles"
          }
        />
      </div>

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}

      <PrimaryBtn
        busy={busy}
        disabled={
          balance == null ||
          balance < stake ||
          stake < CASINO_MIN_STAKE ||
          selected.size < 1 ||
          revealed === true
        }
        label={revealed ? "Pick new tiles" : "Reveal"}
        busyLabel="Revealing…"
        onClick={() => {
          if (revealed) {
            setSelected(new Set());
            setLast(null);
            return;
          }
          void play();
        }}
      />
    </CasinoShell>
  );
}
