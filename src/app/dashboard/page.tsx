"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { RESET_COOLDOWN_MS } from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";

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
    if (!wallet || wallet.balance !== 0 || wallet.resetPendingSince === null)
      return;
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
        headers: { Authorization: "Bearer " + idToken },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reset wallet.");
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : "Something went wrong."
      );
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
    return hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 overflow-x-hidden px-4 pb-28 pt-5">
      {/* Profile */}
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/15 font-display text-xl font-bold text-brand">
          {(user.displayName ?? "P").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">
            {user.displayName ?? "Player"}
          </h1>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
        </div>
        <Link
          href="/account/settings"
          className="rounded-full bg-surface p-2.5 shadow-card"
          aria-label="Settings"
        >
          ⚙️
        </Link>
      </div>

      {/* Balance */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-emerald-800 p-5 text-white shadow-card">
        <p className="text-xs font-medium text-white/70">Play-money balance</p>
        <p
          className="mt-1 break-all font-display text-2xl font-bold tabular-nums"
          title={
            wallet
              ? "₦" + wallet.balance.toLocaleString("en-NG")
              : undefined
          }
        >
          {walletLoading
            ? "…"
            : wallet
              ? formatMoney(wallet.balance)
              : "—"}
        </p>
        <p className="mt-1 text-[10px] text-white/50">
          Virtual funds only · Nothing is real money
        </p>

        {cooldownActive && (
          <div className="mt-4 border-t border-white/20 pt-4">
            {cooldownDone ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={resetSubmitting}
                className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50"
              >
                {resetSubmitting ? "Resetting…" : "Reset to ₦100,000"}
              </button>
            ) : (
              <p className="text-sm text-white/70">
                Reset available in {formatRemaining(remainingMs)}
              </p>
            )}
            {resetError && (
              <p className="mt-2 text-sm text-white/90">{resetError}</p>
            )}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/bets"
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface p-3 shadow-card"
        >
          <span className="text-xl">🎫</span>
          <span className="text-[11px] font-medium">My Bets</span>
        </Link>
        <Link
          href="/fixtures"
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface p-3 shadow-card"
        >
          <span className="text-xl">⚽</span>
          <span className="text-[11px] font-medium">Fixtures</span>
        </Link>
        <Link
          href="/transactions"
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface p-3 shadow-card"
        >
          <span className="text-xl">📋</span>
          <span className="text-[11px] font-medium">Transactions</span>
        </Link>
      </div>

      {/* Stats */}
      {wallet && (
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Statistics
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-ink-muted">Lifetime wagered</p>
              <p
                className="truncate font-display text-base font-bold tabular-nums"
                title={"₦" + wallet.lifetimeWagering.toLocaleString("en-NG")}
              >
                {formatMoney(wallet.lifetimeWagering)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-ink-muted">Current balance</p>
              <p
                className="truncate font-display text-base font-bold tabular-nums text-brand"
                title={"₦" + wallet.balance.toLocaleString("en-NG")}
              >
                {formatMoney(wallet.balance)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menu */}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <MenuItem icon="👤" label="Profile" href="/account/profile" />
        <MenuItem icon="🎫" label="Bet history" href="/bets" />
        <MenuItem icon="📋" label="Transaction records" href="/transactions" />
        <MenuItem icon="⚙️" label="Settings" href="/account/settings" />
        <MenuItem icon="❓" label="How to play" href="/how-to-play" />
        <MenuItem icon="ℹ️" label="About FUNAAB BetSim" href="/about" />
        <MenuItem icon="📄" label="Terms of use" href="/terms" />
        <MenuItem icon="🔒" label="Privacy policy" href="/privacy" />
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 border-t border-ink-muted/10 px-4 py-3.5 text-left active:bg-ink-muted/5"
        >
          <span className="text-xl">🚪</span>
          <span className="flex-1 text-sm font-medium text-loss">Log out</span>
        </button>
      </div>
    </main>
  );
}

function MenuItem({
  icon,
  label,
  href,
}: {
  icon: string;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-ink-muted/10 px-4 py-3.5 last:border-0 active:bg-ink-muted/5"
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-ink-muted"
      >
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
