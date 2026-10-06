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

type Phase = "ready" | "show" | "shuffle" | "pick" | "reveal";

/** Rounded cup / thimble (not a flat box). */
function CupShell({
  lifted,
  highlight,
  dim,
}: {
  lifted: boolean;
  highlight: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto h-[100px] w-[72px] transition-transform duration-500 ease-out ${
        lifted ? "-translate-y-12 -rotate-[22deg]" : ""
      } ${dim ? "opacity-70" : ""}`}
      style={{ transformOrigin: "70% 100%" }}
    >
      {/* rim */}
      <div
        className={`absolute left-1/2 top-0 z-20 h-4 w-[72px] -translate-x-1/2 rounded-full border-2 ${
          highlight
            ? "border-brand bg-emerald-600"
            : "border-amber-950 bg-amber-800"
        }`}
      />
      {/* outer body — trapezoid feel via rounded bottom */}
      <div
        className={`absolute left-1/2 top-2 z-10 h-[88px] w-[68px] -translate-x-1/2 rounded-b-[36px] rounded-t-[8px] border-2 border-t-0 shadow-md ${
          highlight
            ? "border-brand bg-gradient-to-b from-amber-500 via-amber-700 to-amber-950"
            : "border-amber-950 bg-gradient-to-b from-amber-500 via-amber-700 to-amber-950"
        }`}
      >
        {/* wood bands */}
        <div className="absolute left-[8%] top-[28%] h-[3px] w-[84%] rounded-full bg-amber-950/50" />
        <div className="absolute left-[6%] top-[52%] h-[4px] w-[88%] rounded-full bg-slate-400/70" />
        <div className="absolute left-[8%] top-[72%] h-[3px] w-[84%] rounded-full bg-amber-950/50" />
        {/* shine */}
        <div className="absolute left-[12%] top-[18%] h-[40%] w-[10px] rounded-full bg-white/15" />
      </div>
    </div>
  );
}

export default function ThimblesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [phase, setPhase] = useState<Phase>("ready");
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<PlayRes | null>(null);
  const [previewBall, setPreviewBall] = useState(0);
  /**
   * positionOf[cupId] = slot index 0|1|2 (left, mid, right).
   * Cups move between slots with CSS left %.
   */
  const [positionOf, setPositionOf] = useState<number[]>([0, 1, 2]);
  const [lifted, setLifted] = useState<number[]>([]);

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

  function resetRound() {
    setPhase("ready");
    setPick(null);
    setLast(null);
    setErr(null);
    setLifted([]);
    setPositionOf([0, 1, 2]);
  }

  function swapPositions(a: number, b: number) {
    setPositionOf((prev) => {
      const next = [...prev];
      // swap slot of cup that is in slot a with cup in slot b
      const cupA = next.indexOf(a);
      const cupB = next.indexOf(b);
      if (cupA < 0 || cupB < 0) return prev;
      next[cupA] = b;
      next[cupB] = a;
      return next;
    });
  }

  async function startRound() {
    if (busy || balance == null || balance < stake) return;
    setErr(null);
    setLast(null);
    setPick(null);
    setLifted([]);
    setPositionOf([0, 1, 2]);

    const preview = Math.floor(Math.random() * 3);
    setPreviewBall(preview);
    setPhase("show");
    setLifted([preview]);

    await new Promise((r) => setTimeout(r, 1100));
    setLifted([]);
    await new Promise((r) => setTimeout(r, 250));
    setPhase("shuffle");

    // Real visual swaps between slots
    const swaps: [number, number][] = [
      [0, 1],
      [1, 2],
      [0, 2],
      [0, 1],
      [1, 2],
      [0, 2],
      [0, 1],
      [1, 2],
    ];
    for (const [a, b] of swaps) {
      swapPositions(a, b);
      await new Promise((r) => setTimeout(r, 280));
    }

    // Settle to identity so cup id === slot (easier to pick)
    setPositionOf([0, 1, 2]);
    await new Promise((r) => setTimeout(r, 200));
    setPhase("pick");
  }

  async function chooseCup(cup: number) {
    if (phase !== "pick" || !user || busy) return;
    setPick(cup);
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
        body: JSON.stringify({ game: "thimbles", stake, pick: cup }),
      });
      const data = (await res.json()) as PlayRes;
      if (!res.ok) throw new Error(data.error || "Play failed");

      setLast(data);
      setPhase("reveal");
      const ball = typeof data.ball === "number" ? data.ball : cup;
      setLifted([...new Set([cup, ball])]);
      if (typeof data.balanceAfter === "number") setBalance(data.balanceAfter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Play failed");
      setPhase("pick");
    } finally {
      setBusy(false);
    }
  }

  const resultText =
    last != null && typeof last.ball === "number"
      ? last.won
        ? `Found it! · Payout ${chips(last.payout ?? 0)}`
        : `Miss · Ball was under cup ${last.ball + 1} · Lost ${chips(stake)}`
      : null;

  const canStart =
    (phase === "ready" || phase === "reveal") &&
    balance != null &&
    balance >= stake &&
    stake >= CASINO_MIN_STAKE;

  /** Slot centre as % of stage width */
  const slotLeft = (slot: number) => `${16.6 + slot * 33.3}%`;

  return (
    <CasinoShell title="Thimbles" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      <p className="mb-2 text-center text-xs text-ink-muted">
        {phase === "ready" && "Watch where the gem is, then track the shuffle"}
        {phase === "show" && "Remember this cup…"}
        {phase === "shuffle" && "Follow the cups…"}
        {phase === "pick" && "Tap the cup with the gem"}
        {phase === "reveal" &&
          (last?.won ? "Nice find!" : "Wrong cup — try again")}
        {" · "}
        {THIMBLES_MULT.toFixed(2)}x
      </p>

      {/* Stage with absolutely positioned cups so they can slide */}
      <div className="relative mb-4 h-44 overflow-hidden rounded-2xl border border-ink-muted/15 bg-gradient-to-b from-stone-300/60 to-stone-400/40 dark:from-stone-800/60 dark:to-stone-900/50">
        {/* slot markers */}
        {[0, 1, 2].map((s) => (
          <div
            key={`slot-${s}`}
            className="pointer-events-none absolute bottom-3 h-2 w-14 -translate-x-1/2 rounded-full bg-black/10"
            style={{ left: slotLeft(s) }}
          />
        ))}

        {[0, 1, 2].map((cupId) => {
          const slot = positionOf[cupId] ?? cupId;
          const isLifted = lifted.includes(cupId);
          const showGem =
            isLifted &&
            ((phase === "show" && cupId === previewBall) ||
              (phase === "reveal" && last?.ball === cupId));
          const highlight = pick === cupId;

          return (
            <button
              key={cupId}
              type="button"
              disabled={phase !== "pick" || busy}
              onClick={() => void chooseCup(cupId)}
              className="absolute bottom-6 w-20 -translate-x-1/2 disabled:cursor-default"
              style={{
                left: slotLeft(slot),
                transition:
                  phase === "shuffle"
                    ? "left 0.26s cubic-bezier(0.4, 0, 0.2, 1)"
                    : "left 0.2s ease",
                zIndex: isLifted ? 20 : 10 + slot,
              }}
            >
              {/* gem sits under cup, visible when lifted */}
              {showGem && (
                <span
                  className="absolute bottom-1 left-1/2 z-0 -translate-x-1/2 text-2xl"
                  aria-hidden
                >
                  💎
                </span>
              )}
              <CupShell
                lifted={isLifted}
                highlight={highlight}
                dim={phase === "reveal" && !isLifted}
              />
              <span
                className={`mt-1 block text-center text-[11px] font-bold ${
                  highlight ? "text-brand" : "text-ink-muted"
                }`}
              >
                {cupId + 1}
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

      {phase === "pick" ? (
        <p className="mt-4 text-center text-sm font-semibold text-brand">
          Tap a cup
        </p>
      ) : phase === "shuffle" || phase === "show" ? (
        <PrimaryBtn
          busy
          disabled
          label="…"
          busyLabel={phase === "show" ? "Showing gem…" : "Shuffling…"}
          onClick={() => {}}
        />
      ) : (
        <PrimaryBtn
          busy={busy}
          disabled={!canStart}
          label={phase === "reveal" ? "Play again" : "Start round"}
          busyLabel="…"
          onClick={() => {
            if (phase === "reveal") resetRound();
            void startRound();
          }}
        />
      )}
    </CasinoShell>
  );
        }
