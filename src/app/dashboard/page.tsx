"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { RESET_COOLDOWN_MS } from "@/types/domain";
import type { Wallet } from "@/types/domain";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // forces a re-render every second for the countdown
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadWallet() {
      try {
        const idToken = await user!.getIdToken();
        const response = await fetch("/api/wallet", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(`Could not load wallet (${response.status}): ${body.error ?? "unknown"}`);
        }
        const data = (await response.json()) as Wallet;
        if (!cancelled) setWallet(data);
      } catch (err) {
        if (!cancelled) {
          setWalletError(err instanceof Error ? err.message : "Something went wrong.");
        }
      }
    }

    loadWallet();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Only ticks while the countdown is actually relevant — no wasted timers
  // once the wallet has a normal balance.
  useEffect(() => {
    if (!wallet || wallet.balance !== 0 || wallet.resetPendingSince === null) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [wallet]);

  async function handleReset() {
    if (!user) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/wallet/reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reset wallet.");
      setWallet((prev) => (prev ? { ...prev, balance: body.balance, resetPendingSince: null } : prev));
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setResetSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  const isZero = wallet?.balance === 0;
  const cooldownActive = isZero && wallet?.resetPendingSince != null;
  const remainingMs = cooldownActive
    ? RESET_COOLDOWN_MS - (Date.now() - wallet!.resetPendingSince!)
    : 0;
  const cooldownDone = cooldownActive && remainingMs <= 0;
  void tick; // read so the effect above isn't flagged as unused-only re-render

  function formatRemaining(ms: number) {
    const totalMinutes = Math.max(0, Math.ceil(ms / (60 * 1000)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 pt-6 pb-28">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 font-display text-lg font-bold text-brand">
          {(user.displayName ?? "P").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">Welcome back</p>
          <h1 className="truncate font-display text-xl font-bold">{user.displayName ?? "Player"}</h1>
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-5 shadow-card">
        <p className="text-sm font-medium text-ink-muted">Virtual balance</p>
        {walletError ? (
          <p className="mt-1 text-sm text-loss">{walletError}</p>
        ) : wallet ? (
          <p className="mt-1 font-display text-3xl font-bold text-accent">
            ₦{wallet.balance.toLocaleString("en-NG")}
          </p>
        ) : (
          <p className="mt-1 text-ink-muted">Loading…</p>
        )}

        {cooldownActive && (
          <div className="mt-4 border-t border-ink-muted/15 pt-4">
            {cooldownDone ? (
              <>
                <p className="text-sm text-ink-muted">Your balance is ready to reset.</p>
                <button
                  onClick={handleReset}
                  disabled={resetSubmitting}
                  className="mt-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {resetSubmitting ? "Resetting…" : "Reset to ₦100,000"}
                </button>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Reset available in {formatRemaining(remainingMs)}</p>
            )}
            {resetError && <p className="mt-2 text-sm text-loss">{resetError}</p>}
          </div>
        )}
      </div>

      <button
        onClick={logout}
        className="rounded-2xl bg-surface px-5 py-3.5 text-left text-sm font-semibold text-loss shadow-card"
      >
        Log out
      </button>
    </main>
  );
}
