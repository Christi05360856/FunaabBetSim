"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
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
import {
  bindGlobalAudioUnlock,
  sfxBet,
  sfxBomb,
  sfxCashout,
  sfxDiamond,
  unlockAudio,
} from "@/lib/casino/sounds";

export default function MinesPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(100);
  const [mineCount, setMineCount] = useState(3);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [mines, setMines] = useState<number[] | null>(null);
  const [status, setStatus] = useState<"idle" | "active" | "busted" | "cashed">(
    "idle"
  );
  const [mult, setMult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
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

  useEffect(() => {
    bindGlobalAudioUnlock();
  }, []);

  async function start() {
    if (!user || busy) return;
    unlockAudio();
    setBusy(true);
    setErr(null);
    setBanner(null);
    setWon(null);
    setMines(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game: "mines",
          action: "start",
          stake,
          mineCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Start failed");
      setSessionId(data.sessionId);
      setFair(
        typeof data.seedHash === "string" ? `Fair-play hash ${data.seedHash.slice(0, 16)}…` : null
      );
      setRevealed([]);
      setStatus("active");
      setMult(1);
      if (typeof data.balance === "number") setBalance(data.balance);
      sfxBet();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function reveal(tile: number) {
    if (!user || !sessionId || busy || status !== "active") return;
    if (revealed.includes(tile)) return;
    unlockAudio();
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
          game: "mines",
          action: "reveal",
          sessionId,
          tile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reveal failed");
      setRevealed(data.revealed || []);
      setMult(data.multiplier || 0);
      if (!data.hit) sfxDiamond();
      if (data.hit) {
        setStatus("busted");
        setMines(data.mines || null);
        if (typeof data.seed === "string") {
          setFair(`Seed revealed: ${data.seed.slice(0, 16)}…`);
        }
        setWon(false);
        setBanner("Hit a mine");
        sfxBomb();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (!user || !sessionId || busy || status !== "active") return;
    unlockAudio();
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
          game: "mines",
          action: "cashout",
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cashout failed");
      setStatus("cashed");
      setWon(true);
      setBanner(`+${chips(data.profit ?? 0)} · ${data.multiplier}x`);
      sfxCashout();
      setMines(data.mines || null);
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
    <CasinoShell title="Mines" balance={balance}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-ink-muted">
          Mines
          <select
            className="ml-2 rounded-lg border border-ink-muted/20 bg-surface px-2 py-1 text-sm font-bold"
            value={mineCount}
            disabled={status === "active"}
            onChange={(e) => setMineCount(Number(e.target.value))}
          >
            {Array.from({ length: MINES_MAX - MINES_MIN + 1 }, (_, i) => (
              <option key={i} value={MINES_MIN + i}>
                {MINES_MIN + i}
              </option>
            ))}
          </select>
        </label>
        {status === "active" && (
          <span className="text-xs font-bold text-brand">
            {mult.toFixed(2)}x
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {Array.from({ length: MINES_GRID }, (_, i) => {
          const rev = revealed.includes(i);
          const isMine = mines?.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={status !== "active" || busy || rev}
              onClick={() => void reveal(i)}
              className={`aspect-square rounded-lg text-sm font-bold disabled:opacity-90 ${
                isMine
                  ? "bg-red-500 text-white"
                  : rev
                    ? "bg-emerald-500/15 text-2xl"
                    : "border border-ink-muted/15 bg-surface text-lg"
              }`}
            >
              {isMine ? "💣" : rev ? "💎" : ""}
            </button>
          );
        })}
      </div>

      <ResultBanner won={won} text={banner} />

      {status !== "active" && (
        <StakeBar
          stake={stake}
          setStake={setStake}
          balance={balance}
          min={CASINO_MIN_STAKE}
          max={CASINO_MAX_STAKE}
        />
      )}

      {err && (
        <p className="mt-3 text-center text-xs font-medium text-red-600">{err}</p>
      )}
      {fair && (
        <p className="mt-2 text-center text-[10px] text-ink-muted">{fair}</p>
      )}

      {status === "active" ? (
        <PrimaryBtn
          busy={busy}
          disabled={revealed.length < 1}
          label={`Cash out · ${mult.toFixed(2)}x`}
          busyLabel="…"
          onClick={() => void cashout()}
        />
      ) : (
        <PrimaryBtn
          busy={busy}
          disabled={balance == null || balance < stake}
          label="Start"
          busyLabel="Starting…"
          onClick={() => void start()}
        />
      )}
    </CasinoShell>
  );
  }
                
