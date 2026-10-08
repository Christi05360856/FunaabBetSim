"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_GAMES,
  CASINO_RELOAD_CHIPS,
  CASINO_START_CHIPS,
} from "@/types/casino";

type BalancePayload = {
  ok?: boolean;
  balance?: number;
  canReload?: boolean;
  reloadReason?: string | null;
  retryAfterMs?: number;
  error?: string;
};

function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

function cooldown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m <= 0 ? `${r}s` : `${m}m ${r.toString().padStart(2, "0")}s`;
}

const ICONS: Record<string, string> = {
  dice: "🎲",
  coin: "🪙",
  mines: "💣",
  wheel: "🎡",
  crash: "📈",
};

export default function CasinoPage() {
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [canReload, setCanReload] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/balance", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json()) as BalancePayload;
      if (!res.ok) throw new Error(data.error || "Could not load balance");
      setBalance(typeof data.balance === "number" ? data.balance : 0);
      setCanReload(!!data.canReload);
      setRetryAfterMs(data.retryAfterMs ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (retryAfterMs <= 0) return;
    const t = setInterval(() => {
      setRetryAfterMs((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) setCanReload(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [retryAfterMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onReload() {
    if (!user || reloading) return;
    setReloading(true);
    setMsg(null);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/reload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as BalancePayload & {
        granted?: number;
      };
      if (!res.ok) {
        setCanReload(false);
        setRetryAfterMs(data.retryAfterMs ?? 0);
        throw new Error(data.error || "Reload failed");
      }
      setBalance(typeof data.balance === "number" ? data.balance : 0);
      setCanReload(false);
      setRetryAfterMs(data.retryAfterMs ?? 0);
      setMsg(`+${chips(data.granted ?? CASINO_RELOAD_CHIPS)} chips`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reload failed");
    } finally {
      setReloading(false);
    }
  }

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center px-4">
        <p className="text-sm text-ink-muted">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-bold text-ink">Casino</p>
        <p className="mt-2 text-sm text-ink-muted">Sign in to play for free.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg px-4 pb-28 pt-4 text-ink">
      {/* Title row */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Casino</h1>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Play for free · Demo chips
          </p>
        </div>
      </div>

      {/* Balance card */}
      <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          Demo balance
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
          {loading && balance == null ? "…" : chips(balance ?? 0)}
          <span className="ml-1 text-sm font-semibold text-ink-muted">
            chips
          </span>
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          Start {chips(CASINO_START_CHIPS)} · Reload {chips(CASINO_RELOAD_CHIPS)}{" "}
          when empty
        </p>

        {balance === 0 && (
          <button
            type="button"
            disabled={!canReload || reloading || retryAfterMs > 0}
            onClick={() => void onReload()}
            className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-45"
          >
            {reloading
              ? "Reloading…"
              : retryAfterMs > 0
                ? `Reload in ${cooldown(retryAfterMs)}`
                : canReload
                  ? `Reload ${chips(CASINO_RELOAD_CHIPS)} chips`
                  : "Reload unavailable"}
          </button>
        )}
      </section>

      {msg && (
        <p className="mt-3 text-center text-xs font-semibold text-emerald-600">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-3 text-center text-xs font-semibold text-red-600">
          {err}
        </p>
      )}

      {/* Games */}
      <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-ink-muted">
        Games
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {CASINO_GAMES.map((g) => (
          <Link
            key={g.id}
            href={g.playReady ? `/casino/${g.id}` : "#"}
            className={`relative overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface p-4 transition active:scale-[0.98] ${
              g.playReady ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <span className="text-2xl" aria-hidden>
              {ICONS[g.id] ?? "🎮"}
            </span>
            <p className="mt-2 text-sm font-bold text-ink">{g.name}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
              {g.blurb}
            </p>
            {g.playReady && (
              <span className="mt-3 inline-block rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                Play
              </span>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
