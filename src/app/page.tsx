"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";

export default function HomePage() {
  const { user, loading } = useAuth();
  const { wallet } = useWallet();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pt-5 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-accent">Play money only</p>
          <h1 className="font-display text-2xl font-bold">FUNAAB BetSim</h1>
        </div>
        {user && wallet && (
          <Link
            href="/dashboard"
            className="rounded-full bg-surface px-4 py-2 font-display text-sm font-bold text-brand shadow-card"
          >
            ₦{wallet.balance.toLocaleString("en-NG")}
          </Link>
        )}
      </div>

      {/* Quick Action Icons */}
      <div className="grid grid-cols-4 gap-3">
        <QuickAction icon="⚽" label="All Sports" href="/fixtures" />
        <QuickAction icon="🔴" label="Live" href="/fixtures?filter=live" />
        <QuickAction icon="🎫" label="My Bets" href="/bets" />
        <QuickAction icon="👤" label="Account" href="/dashboard" />
      </div>

      {/* Featured Section */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-card">
        <p className="text-sm font-medium text-white/70">Virtual Balance</p>
        <p className="mt-1 font-display text-3xl font-bold">
          {user && wallet ? `₦${wallet.balance.toLocaleString("en-NG")}` : "₦100,000"}
        </p>
        <p className="mt-2 text-sm text-white/70">
          Practice betting with zero risk
        </p>
        {!user && !loading && (
          <Link
            href="/register"
            className="mt-4 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand"
          >
            Get Started
          </Link>
        )}
      </div>

      {/* Quick Filter Chips */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Quick Filters</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <FilterChip label="Today's Football" href="/fixtures?filter=today" />
          <FilterChip label="Live Now" href="/fixtures?filter=live" />
          <FilterChip label="Hot Matches" href="/fixtures?filter=hot" />
          <FilterChip label="All Fixtures" href="/fixtures" />
        </div>
      </div>

      {/* CTA for logged out users */}
      {!user && !loading && (
        <div className="flex flex-col gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-brand px-4 py-3 text-center font-medium text-white"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-ink-muted px-4 py-3 text-center font-medium"
          >
            Log in
          </Link>
        </div>
      )}

      {/* Recent Activity placeholder */}
      {user && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-muted">Quick Access</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/fixtures"
              className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card"
            >
              <span className="text-2xl">⚽</span>
              <div>
                <p className="text-sm font-semibold">Fixtures</p>
                <p className="text-xs text-ink-muted">Browse matches</p>
              </div>
            </Link>
            <Link
              href="/bets"
              className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card"
            >
              <span className="text-2xl">🎫</span>
              <div>
                <p className="text-sm font-semibold">My Bets</p>
                <p className="text-xs text-ink-muted">View history</p>
              </div>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

function QuickAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-2xl shadow-card">
        {icon}
      </div>
      <span className="text-xs font-medium text-ink-muted">{label}</span>
    </Link>
  );
}

function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink-muted shadow-card"
    >
      {label}
    </Link>
  );
}
