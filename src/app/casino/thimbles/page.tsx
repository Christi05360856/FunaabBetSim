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

/** Wooden barrel with steel hoops and a dark open top. */
function BarrelShell({
  uid,
  lifted,
  highlight,
  dim,
}: {
  uid: string;
  lifted: boolean;
  highlight: boolean;
  dim?: boolean;
}) {
  const wood = `wood-${uid}`;
  const steel = `steel-${uid}`;
  const inner = `inner-${uid}`;
  const rim = `rim-${uid}`;

  return (
    <div
      className={`relative mx-auto h-[100px] w-[84px] transition-transform duration-500 ease-out ${
        lifted ? "-translate-y-10 -rotate-[14deg]" : ""
      } ${dim ? "opacity-70" : ""}`}
      style={{
        transformOrigin: "70% 100%",
        filter: highlight ? "drop-shadow(0 0 7px #10b981)" : undefined,
      }}
    >
      <svg
        viewBox="0 0 84 100"
        width="84"
        height="100"
        className="block overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={wood} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3f230e" />
            <stop offset="0.25" stopColor="#9a5a26" />
            <stop offset="0.5" stopColor="#c8803f" />
            <stop offset="0.75" stopColor="#8f5122" />
            <stop offset="1" stopColor="#38200c" />
          </linearGradient>
          <linearGradient id={steel} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#323f56" />
            <stop offset="0.3" stopColor="#9fb0cc" />
            <stop offset="0.5" stopColor="#dbe3f1" />
            <stop offset="0.75" stopColor="#7a8bab" />
            <stop offset="1" stopColor="#2e3b52" />
          </linearGradient>
          <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d89556" />
            <stop offset="1" stopColor="#8a5024" />
          </linearGradient>
          <radialGradient id={inner} cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#140a04" />
            <stop offset="1" stopColor="#3d210d" />
          </radialGradient>
        </defs>

        {/* body */}
        <path
          d="M10 14 C0 40 0 62 10 86 C30 96 54 96 74 86 C84 62 84 40 74 14 Z"
          fill={`url(#${wood})`}
          stroke="#2a1608"
          strokeWidth="1.5"
        />

        {/* staves */}
        <g
          fill="none"
          stroke="#2a1608"
          strokeOpacity="0.45"
          strokeWidth="1.2"
        >
          <path d="M24 20 C17 44 17 66 24 92" />
          <path d="M42 22 L42 96" />
          <path d="M60 20 C67 44 67 66 60 92" />
        </g>

        {/* shine */}
        <path
          d="M17 30 C13 46 13 62 17 76"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.22"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* hoops */}
        <path
          d="M5 30 Q42 41 79 30 L80 38 Q42 49 4 38 Z"
          fill={`url(#${steel})`}
          stroke="#1f2a3d"
          strokeWidth="1"
        />
        <path
          d="M3.5 62 Q42 73 80.5 62 L80.5 70 Q42 81 3.5 70 Z"
          fill={`url(#${steel})`}
          stroke="#1f2a3d"
          strokeWidth="1"
        />

        {/* top rim + opening */}
        <ellipse
          cx="42"
          cy="14"
          rx="32"
          ry="10"
          fill={`url(#${rim})`}
          stroke="#2a1608"
          strokeWidth="1.5"
        />
        <ellipse
          cx="42"
          cy="14.5"
          rx="26.5"
          ry="7"
          fill={`url(#${inner})`}
          stroke="#2a1608"
          strokeWidth="1"
        />
      </svg>
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
        : `Miss · Ball was under barrel ${last.ball + 1} · Lost ${chips(stake)}`
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
        {phase === "show" && "Remember this barrel…"}
        {phase === "shuffle" && "Follow the barrels…"}
        {phase === "pick" && "Tap the barrel with the gem"}
        {phase === "reveal" &&
          (last?.won ? "Nice find!" : "Wrong barrel — try again")}
        {" · "}
        {THIMBLES_MULT.toFixed(2)}x
      </p>

      {/* Stage with absolutely positioned barrels so they can slide */}
      <div className="relative mb-4 h-56 overflow-hidden rounded-2xl border border-slate-900/40 bg-gradient-to-b from-slate-500 to-slate-700 shadow-inner">
        {/* stone texture hint */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.10),transparent_45%),radial-gradient(circle_at_80%_60%,rgba(0,0,0,0.18),transparent_50%)]" />

        {/* floor shadows */}
        {[0, 1, 2].map((s) => (
          <div
            key={`slot-${s}`}
            className="pointer-events-none absolute bottom-6 h-3 w-20 -translate-x-1/2 rounded-full bg-black/30 blur-[2px]"
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
              className="absolute bottom-7 w-24 -translate-x-1/2 disabled:cursor-default"
              style={{
                left: slotLeft(slot),
                transition:
                  phase === "shuffle"
                    ? "left 0.26s cubic-bezier(0.4, 0, 0.2, 1)"
                    : "left 0.2s ease",
                zIndex: isLifted ? 20 : 10 + slot,
              }}
            >
              {/* gem sits under barrel, visible when lifted */}
              {showGem && (
                <span
                  className="absolute left-1/2 z-0 -translate-x-1/2 text-3xl"
                  style={{ bottom: 20 }}
                  aria-hidden
                >
                  💎
                </span>
              )}
              <BarrelShell
                uid={`b${cupId}`}
                lifted={isLifted}
                highlight={highlight}
                dim={phase === "reveal" && !isLifted}
              />
              <span
                className={`mt-1 block text-center text-[11px] font-bold ${
                  highlight ? "text-emerald-300" : "text-white/80"
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
          Tap a barrel
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
