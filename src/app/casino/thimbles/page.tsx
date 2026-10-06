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

/** CSS barrel — reference structure only, our colours */
function Barrel({
  open,
  selected,
  shaking,
  showGem,
}: {
  open: boolean;
  selected: boolean;
  shaking: boolean;
  showGem: boolean;
}) {
  return (
    <div
      className={`relative flex h-28 w-full flex-col items-center justify-end ${
        shaking ? "animate-pulse" : ""
      }`}
    >
      {/* Gem under barrel when open */}
      {showGem && (
        <span
          className="absolute bottom-2 z-0 text-2xl drop-shadow-md"
          aria-hidden
        >
          💎
        </span>
      )}
      <div
        className={`relative z-10 flex w-[88%] flex-col transition-transform duration-500 ease-out ${
          open ? "-translate-y-14 -rotate-[18deg]" : "translate-y-0 rotate-0"
        }`}
        style={{ transformOrigin: "80% 100%" }}
      >
        {/* Lid ring */}
        <div
          className={`mx-auto h-3 w-[92%] rounded-full border-2 ${
            selected
              ? "border-brand bg-brand/40"
              : "border-amber-800/80 bg-amber-700/90"
          }`}
        />
        {/* Body */}
        <div
          className={`-mt-1 flex h-20 flex-col justify-between rounded-b-xl rounded-t-sm border-2 px-1 py-2 ${
            selected
              ? "border-brand bg-gradient-to-b from-amber-600 to-amber-800"
              : "border-amber-900/70 bg-gradient-to-b from-amber-600 to-amber-900"
          }`}
        >
          <div className="mx-auto h-1 w-[85%] rounded-full bg-amber-950/40" />
          <div className="mx-auto h-1.5 w-full rounded-full bg-slate-400/80" />
          <div className="mx-auto h-1 w-[85%] rounded-full bg-amber-950/40" />
          <div className="mx-auto h-1.5 w-full rounded-full bg-slate-400/80" />
          <div className="mx-auto h-1 w-[85%] rounded-full bg-amber-950/40" />
        </div>
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
  /** Visual only — where we flash the gem before shuffle */
  const [previewBall, setPreviewBall] = useState(0);
  /** Slot order for shuffle animation (permutation of 0,1,2) */
  const [order, setOrder] = useState([0, 1, 2]);
  const [openCups, setOpenCups] = useState<number[]>([]);

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
    setOpenCups([]);
    setOrder([0, 1, 2]);
  }

  /** Start: show gem → close → shuffle → pick */
  async function startRound() {
    if (busy || balance == null || balance < stake) return;
    setErr(null);
    setLast(null);
    setPick(null);
    setOpenCups([]);
    setOrder([0, 1, 2]);

    const preview = Math.floor(Math.random() * 3);
    setPreviewBall(preview);
    setPhase("show");
    setOpenCups([preview]);

    await new Promise((r) => setTimeout(r, 900));
    setOpenCups([]);
    setPhase("shuffle");

    // Cosmetic swaps
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 120));
      setOrder((prev) => {
        const next = [...prev];
        const a = Math.floor(Math.random() * 3);
        let b = Math.floor(Math.random() * 3);
        if (b === a) b = (a + 1) % 3;
        const t = next[a]!;
        next[a] = next[b]!;
        next[b] = t;
        return next;
      });
    }
    setOrder([0, 1, 2]);
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
      // Lift chosen cup + ball cup so player sees the gem
      const ball = typeof data.ball === "number" ? data.ball : cup;
      setOpenCups([...new Set([cup, ball])]);
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
    phase === "ready" || phase === "reveal"
      ? balance != null && balance >= stake && stake >= CASINO_MIN_STAKE
      : false;

  return (
    <CasinoShell title="Thimbles" balance={balance}>
      <ResultBanner won={last?.won ?? null} text={resultText} />

      <p className="mb-2 text-center text-xs text-ink-muted">
        {phase === "ready" && "Watch the gem, then find it after the shuffle"}
        {phase === "show" && "Gem placed — cups closing…"}
        {phase === "shuffle" && "Shuffling…"}
        {phase === "pick" && "Tap a cup"}
        {phase === "reveal" &&
          (last?.won ? "You found the gem!" : "Wrong cup")}
        {" · "}
        pays {THIMBLES_MULT.toFixed(2)}x
      </p>

      {/* Stage */}
      <div className="mb-4 rounded-2xl border border-ink-muted/15 bg-gradient-to-b from-stone-200/80 to-stone-300/50 px-2 py-6 dark:from-stone-800/50 dark:to-stone-900/40">
        <div className="flex items-end justify-center gap-2">
          {order.map((cupIndex, slot) => {
            const selected = pick === cupIndex;
            const open = openCups.includes(cupIndex);
            const showGem =
              open &&
              ((phase === "show" && cupIndex === previewBall) ||
                (phase === "reveal" && last?.ball === cupIndex));
            return (
              <button
                key={`${slot}-${cupIndex}`}
                type="button"
                disabled={phase !== "pick" || busy}
                onClick={() => void chooseCup(cupIndex)}
                className="w-[30%] disabled:cursor-default"
              >
                <Barrel
                  open={open}
                  selected={selected || (phase === "pick" && false)}
                  shaking={phase === "shuffle"}
                  showGem={!!showGem}
                />
                <span
                  className={`mt-1 block text-center text-[11px] font-bold ${
                    selected ? "text-brand" : "text-ink-muted"
                  }`}
                >
                  {cupIndex + 1}
                </span>
              </button>
            );
          })}
        </div>
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
        <p className="mt-4 text-center text-sm font-semibold text-ink">
          Choose a cup…
        </p>
      ) : phase === "shuffle" || phase === "show" ? (
        <PrimaryBtn
          busy
          disabled
          label="…"
          busyLabel={phase === "show" ? "Placing gem…" : "Shuffling…"}
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
          
