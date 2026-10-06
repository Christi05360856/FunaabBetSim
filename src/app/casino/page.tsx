"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_GAMES, CASINO_RELOAD_CHIPS, CASINO_START_CHIPS } from "@/types/casino";

type BalancePayload = {
  ok?: boolean;
  balance?: number;
  canReload?: boolean;
  reloadReason?: string | null;
  retryAfterMs?: number;
  error?: string;
};

function formatChips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

function formatCooldown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

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

  // Tick cooldown display
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
      const data = await res.json();
      if (!res.ok) {
        if (data.retryAfterMs) setRetryAfterMs(data.retryAfterMs);
        if (typeof data.balance === "number") setBalance(data.balance);
        setCanReload(false);
        throw new Error(data.error || "Reload failed");
      }
      setBalance(data.balance);
      setCanReload(false);
      setRetryAfterMs(0);
      setMsg(`+${formatChips(data.credited ?? CASINO_RELOAD_CHIPS)} demo chips added`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reload failed");
    } finally {
      setReloading(false);
      void load();
    }
  }

  return (
    <main className="mx-auto min-h-[70vh] max-w-md px-4 pb-28 pt-3">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-ink">Casino</h1>
        <p className="mt-0.5 text-sm text-ink-muted">F-Betsim originals · demo only</p>
      </header>

      {/* Demo banner — always visible */}
      <div
        className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-ink"
        role="status"
      >
        <p className="font-semibold text-amber-800 dark:text-amber-200">
          Play for free · Demo chips only
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Not real money. Demo balance never withdraws and never mixes with your sports wallet.
        </p>
      </div>

      {authLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !user ? (
        <div className="rounded-2xl border border-ink-muted/15 bg-surface px-4 py-6 text-center">
          <p className="text-sm text-ink-muted">Sign in to use the demo casino.</p>
          <Link
            href="/login"
            className="mt-3 inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <>
          {/* Balance card */}
          <section className="mb-5 rounded-2xl border border-ink-muted/15 bg-surface p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Demo chips
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-ink">
              {loading && balance == null ? "…" : formatChips(balance ?? 0)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Start grant {formatChips(CASINO_START_CHIPS)} · empty reload{" "}
              {formatChips(CASINO_RELOAD_CHIPS)} / hour
            </p>

            {balance === 0 && (
              <div className="mt-3">
                {canReload || retryAfterMs <= 0 ? (
                  <button
                    type="button"
                    disabled={reloading}
                    onClick={() => void onReload()}
                    className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {reloading ? "Reloading…" : `Reload ${formatChips(CASINO_RELOAD_CHIPS)} chips`}
                  </button>
                ) : (
                  <p className="rounded-xl bg-ink-muted/10 px-3 py-2 text-center text-xs text-ink-muted">
                    Next reload in {formatCooldown(retryAfterMs)}
                  </p>
                )}
              </div>
            )}

            {msg && (
              <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {msg}
              </p>
            )}
            {err && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{err}</p>
            )}
          </section>

          {/* Originals lobby */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">F-Betsim originals</h2>
              <span className="text-[10px] font-semibold uppercase text-ink-muted">
                Play for free
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-3">
              {CASINO_GAMES.map((g) => (
                <li key={g.id}>
                  <div className="flex h-full flex-col rounded-2xl border border-ink-muted/15 bg-surface p-3 shadow-sm">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-lg font-bold text-brand">
                      {g.name.charAt(0)}
                    </div>
                    <p className="font-semibold text-ink">{g.name}</p>
                    <p className="mt-0.5 flex-1 text-[11px] text-ink-muted">{g.blurb}</p>
                    {g.playReady ? (
                      <Link
                        href={`/casino/${g.id}`}
                        className="mt-3 block rounded-lg bg-brand py-2 text-center text-xs font-semibold text-white"
                      >
                        Play for free
                      </Link>
                    ) : (
                      <span className="mt-3 block rounded-lg bg-ink-muted/10 py-2 text-center text-xs font-medium text-ink-muted">
                        Coming next
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
