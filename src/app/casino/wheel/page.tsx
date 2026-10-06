"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  WHEEL_SEGMENTS,
} from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";

const COLORS = [
  "#64748b",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#475569",
  "#14b8a6",
  "#6366f1",
  "#f97316",
  "#eab308",
];

type PlayRes = {
  ok?: boolean;
  error?: string;
  segment?: number;
  multiplier?: number;
  won?: boolean;
  profit?: number;
  balanceAfter?: number;
};

export default function WheelPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  /** Absolute CSS rotation degrees (accumulates). */
  const [spinDeg, setSpinDeg] = useState(0);
  const spinDegRef = useRef(0);

  const n = WHEEL_SEGMENTS.length;
  const segAngle = 360 / n;

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

  /**
   * CSS conic-gradient: 0° = top, increases clockwise.
   * Segment i spans [i*seg, (i+1)*seg).
   * Pointer is fixed at top (0°).
   * After rotate(R) clockwise, segment center mid must land at 0°:
   *   (mid + R) % 360 === 0  →  R % 360 === (360 - mid) % 360
   */
  function rotationForSegment(segment: number, current: number): number {
    const mid = segment * segAngle + segAngle / 2;
    const currentMod = ((current % 360) + 360) % 360;
    const desiredMod = (360 - mid) % 360;
    let delta = desiredMod - currentMod;
    if (delta <= 20) delta += 360; // always a visible spin
    return current + delta + 360 * 4;
  }

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
        body: JSON.stringify({ game: "wheel", stake }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");

      if (typeof data.segment === "number") {
        const next = rotationForSegment(data.segment, spinDegRef.current);
        spinDegRef.current = next;
        setSpinDeg(next);
        // Wait for CSS transition before showing result banner
        await new Promise((r) => setTimeout(r, 1300));
      }

      setLast(data);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
      if (typeof data.multiplier === "number") {
        setHistory((h) => [data.multiplier!, ...h].slice(0, 8));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
    } finally {
      setBusy(false);
    }
  }

  const gradient = WHEEL_SEGMENTS.map((_, i) => {
    const start = i * segAngle;
    const end = (i + 1) * segAngle;
    return `${COLORS[i % COLORS.length]} ${start}deg ${end}deg`;
  }).join(", ");

  const resultText =
    last != null && typeof last.multiplier === "number"
      ? last.won
        ? `${last.multiplier.toFixed(2)}x · +${chips(last.profit ?? 0)}`
        : `${last.multiplier.toFixed(2)}x · Lost ${chips(stake)}`
      : null;

  return (
    <CasinoShell title="Wheel" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      {history.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {history.map((m, i) => (
            <span
              key={`${m}-${i}`}
              className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums ${
                m > 0
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-ink-muted/10 text-ink-muted"
              }`}
            >
              {m.toFixed(2)}x
            </span>
          ))}
        </div>
      )}

      <div className="relative mx-auto mb-5 h-64 w-64">
        {/* Strong pointer */}
        <div className="absolute left-1/2 top-[-6px] z-30 -translate-x-1/2">
          <div className="flex flex-col items-center">
            <div className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[18px] border-l-transparent border-r-transparent border-t-brand drop-shadow-md" />
            <div className="h-2 w-2 -mt-0.5 rounded-full bg-brand" />
          </div>
        </div>

        <div
          className="absolute inset-0 rounded-full border-4 border-ink-muted/20 shadow-inner"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${spinDeg}deg)`,
            transition: busy ? "transform 1.2s cubic-bezier(0.12, 0.8, 0.2, 1)" : "none",
          }}
        >
          {WHEEL_SEGMENTS.map((mult, i) => {
            const mid = i * segAngle + segAngle / 2;
            const label =
              mult === 0 ? "0" : Number.isInteger(mult) ? `${mult}x` : `${mult}x`;
            return (
              <span
                key={i}
                className="pointer-events-none absolute left-1/2 top-1/2 -ml-4 flex h-5 w-8 items-center justify-center text-[11px] font-black text-white"
                style={{
                  transform: `rotate(${mid}deg) translateY(-82px) rotate(${-mid}deg)`,
                  textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                }}
              >
                {label}
              </span>
            );
          })}
        </div>

        <div className="absolute inset-[30%] z-10 flex items-center justify-center rounded-full bg-surface shadow-md">
          <span className="text-xs font-bold tracking-wide text-ink-muted">
            SPIN
          </span>
        </div>
      </div>

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
        disabled={
          balance == null || balance < stake || stake < CASINO_MIN_STAKE
        }
        label="Spin"
        busyLabel="Spinning…"
        onClick={() => void play()}
      />
    </CasinoShell>
  );
}
