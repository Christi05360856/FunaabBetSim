"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  type HiloChoice,
} from "@/types/casino";
import {
  CasinoShell,
  PrimaryBtn,
  ResultBanner,
  StakeBar,
  chips,
} from "@/components/casino/CasinoShell";

const FACES = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export default function HiloPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [card, setCard] = useState(7);
  const [mult, setMult] = useState(1);
  const [streak, setStreak] = useState(0);
  const [status, setStatus] = useState<"idle" | "active" | "busted" | "cashed">(
    "idle"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [odds, setOdds] = useState<{ higher: number; lower: number }>({
    higher: 0,
    lower: 0,
  });
  const [fair, setFair] = useState<string | null>(null);

  const loadBal = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/casino/balance", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) setBalance(data.balance);
  }, [user]);

  useEffect(() => {
    void loadBal();
  }, [loadBal]);

  async function start() {
    if (!user || busy) return;
    setBusy(true);
    setErr(null);
    setBanner(null);
    setWon(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ game: "hilo", action: "start", stake }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Start failed");
      setSessionId(data.sessionId);
      setCard(data.card);
      setMult(1);
      setStreak(0);
      setStatus("active");
      if (data.odds) setOdds(data.odds);
      setFair(
        typeof data.seedHash === "string" ? `Fair-play hash ${data.seedHash.slice(0, 16)}…` : null
      );
      if (typeof data.balance === "number") setBalance(data.balance);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function guess(choice: HiloChoice) {
    if (!user || !sessionId || busy || status !== "active") return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "hilo",
          action: "guess",
          sessionId,
          choice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Guess failed");
      setCard(data.card);
      if (data.odds) setOdds(data.odds);
      if (!data.won) {
        setStatus("busted");
        setWon(false);
        setBanner("Wrong — streak lost");
        setMult(0);
        if (typeof data.seed === "string") {
          setFair(`Seed revealed: ${data.seed.slice(0, 16)}…`);
        }
      } else {
        setStreak(data.streak);
        setMult(data.multiplier);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (!user || !sessionId || busy || status !== "active") return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "hilo",
          action: "cashout",
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cashout failed");
      setStatus("cashed");
      setWon(true);
      setBanner(`+${chips(data.profit ?? 0)} · ${data.multiplier}x`);
      if (typeof data.seed === "string") {
        setFair(`Seed revealed: ${data.seed.slice(0, 16)}…`);
      }
      if (typeof data.balance === "number") setBalance(data.balance);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CasinoShell title="Hi-Lo" balance={balance}>
      <div className="mb-4 flex flex-col items-center gap-2">
        <p className="text-[11px] font-semibold text-ink-muted">Card</p>
        <div className="flex h-28 w-20 items-center justify-center rounded-2xl border-2 border-brand bg-surface text-4xl font-extrabold">
          {FACES[card] ?? card}
        </div>
        {status === "active" && (
          <p className="text-xs font-bold text-brand">
            Streak {streak} · {mult.toFixed(2)}x
          </p>
        )}
      </div>

      <ResultBanner won={won} text={banner} />

      {status === "active" ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || odds.higher <= 0}
              onClick={() => void guess("higher")}
              className="rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Higher ▲
              <span className="block text-[11px] font-semibold opacity-90">
                {odds.higher > 0 ? `${odds.higher.toFixed(2)}x` : "not possible"}
              </span>
            </button>
            <button
              type="button"
              disabled={busy || odds.lower <= 0}
              onClick={() => void guess("lower")}
              className="rounded-xl border border-ink-muted/15 bg-surface py-3 text-sm font-bold disabled:opacity-50"
            >
              Lower ▼
              <span className="block text-[11px] font-semibold text-ink-muted">
                {odds.lower > 0 ? `${odds.lower.toFixed(2)}x` : "not possible"}
              </span>
            </button>
          </div>
          <PrimaryBtn
            busy={busy}
            disabled={streak < 1}
            label={`Cash out · ${mult.toFixed(2)}x`}
            busyLabel="…"
            onClick={() => void cashout()}
          />
        </>
      ) : (
        <>
          <StakeBar
            stake={stake}
            setStake={setStake}
            balance={balance}
            min={CASINO_MIN_STAKE}
            max={CASINO_MAX_STAKE}
          />
          <PrimaryBtn
            busy={busy}
            disabled={balance == null || balance < stake}
            label="Start streak"
            busyLabel="…"
            onClick={() => void start()}
          />
        </>
      )}

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}
      {fair && (
        <p className="mt-3 text-center text-[10px] text-ink-muted">{fair}</p>
      )}
    </CasinoShell>
  );
}
