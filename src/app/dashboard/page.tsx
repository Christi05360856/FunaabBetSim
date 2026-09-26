"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { RESET_COOLDOWN_MS } from "@/types/domain";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { wallet, loading: walletLoading } = useWallet();
  const [tick, setTick] = useState(0);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
  void tick;

  function formatRemaining(ms: number) {
    const totalMinutes = Math.max(0, Math.ceil(ms / (60 * 1000)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pt-5 pb-28">
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 font-display text-2xl font-bold text-brand">
          {(user.displayName ?? "P").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold">{user.displayName ?? "Player"}</h1>
          <p className="text-sm text-ink-muted">{user.email}</p>
        </div>
      </div>

      {/* Balance Card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-card">
        <p className="text-sm font-medium text-white/70">Total Balance</p>
        <p className="mt-1 font-display text-3xl font-bold">
          ₦{wallet?.balance.toLocaleString("en-NG") ?? "—"}
        </p>
        
        {cooldownActive && (
          <div className="mt-4 border-t border-white/20 pt-4">
            {cooldownDone ? (
              <button
                onClick={handleReset}
                disabled={resetSubmitting}
                className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50"
              >
                {resetSubmitting ? "Resetting…" : "Reset to ₦100,000"}
              </button>
            ) : (
              <p className="text-sm text-white/70">Reset available in {formatRemaining(remainingMs)}</p>
            )}
            {resetError && <p className="mt-2 text-sm text-white/90">{resetError}</p>}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/bets"
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-4 shadow-card"
        >
          <span className="text-2xl">🎫</span>
          <span className="text-xs font-medium text-center">My Bets</span>
        </Link>
        <Link
          href="/fixtures"
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-4 shadow-card"
        >
          <span className="text-2xl">⚽</span>
          <span className="text-xs font-medium text-center">Fixtures</span>
        </Link>
        <button
          onClick={logout}
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-4 shadow-card"
        >
          <span className="text-2xl">🚪</span>
          <span className="text-xs font-medium text-loss">Log out</span>
        </button>
      </div>

      {/* Stats Row */}
      {wallet && (
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold text-ink-muted mb-3">Statistics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-muted">Lifetime Wagering</p>
              <p className="font-display text-lg font-bold">
                ₦{wallet.lifetimeWagering.toLocaleString("en-NG")}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Current Balance</p>
              <p className="font-display text-lg font-bold text-brand">
                ₦{wallet.balance.toLocaleString("en-NG")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menu Items */}
      <div className="rounded-2xl bg-surface shadow-card divide-y divide-ink-muted/10">
        <MenuItem icon="📋" label="Bet History" href="/bets" />
        <MenuItem icon="⚙️" label="Settings" href="#" />
        <MenuItem icon="❓" label="How to Play" href="#" />
        <MenuItem icon="💡" label="Share Feedback" href="#" />
      </div>
    </main>
  );
}

function MenuItem({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-ink-muted/5">
      <span className="text-xl">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-ink-muted">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
