"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { availableToBet, withdrawableBalance } from "@/lib/domain/wallet";
import { formatMoney } from "@/lib/domain/selectionLabel";
import SafetyNotice from "@/components/SafetyNotice";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { wallet, loading: walletLoading } = useWallet();
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [depositPoints, setDepositPoints] = useState<string | null>(null);
  const [depositReason, setDepositReason] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setDepositStatus(q.get("deposit"));
    setDepositPoints(q.get("points"));
    setDepositReason(q.get("reason"));
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
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

      <SafetyNotice />

      {depositStatus === "success" && (
        <div className="rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">
          Payment successful
          {depositPoints ? ` · +${Number(depositPoints).toLocaleString("en-NG")} points credited` : ""}.
        </div>
      )}
      {depositStatus === "failed" && (
        <div className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          Payment could not be confirmed
          {depositReason ? ` (${depositReason})` : ""}.
          {" "}If you were charged, contact support with your receipt.
        </div>
      )}

      {/* Balance — free amounts only (not gross ledger buckets) */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-emerald-800 p-5 text-white shadow-card">
        <p className="text-xs font-medium text-white/70">Available to bet</p>
        <p className="mt-1 break-all font-display text-3xl font-bold tabular-nums">
          {walletLoading
            ? "…"
            : wallet
              ? formatMoney(availableToBet(wallet))
              : "—"}
        </p>
        <p className="mt-1 text-[11px] text-white/60">
          Free cash + free promo · locks open bets & pending withdrawals
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/10 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
              Withdrawable
            </p>
            <p className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {walletLoading
                ? "…"
                : wallet
                  ? formatMoney(withdrawableBalance(wallet))
                  : "—"}
            </p>
            <p className="text-[10px] text-white/50">Cash only</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
              Promo total
            </p>
            <p className="mt-0.5 font-display text-lg font-bold tabular-nums">
              {walletLoading
                ? "…"
                : wallet
                  ? formatMoney(wallet.promo ?? 0)
                  : "—"}
            </p>
            <p className="text-[10px] text-white/50">Not withdrawable</p>
          </div>
        </div>

        {(wallet?.reservedStake ?? 0) + (wallet?.reservedWithdrawal ?? 0) > 0 && (
          <p className="mt-3 text-[10px] text-white/55">
            Locked now:{" "}
            {formatMoney(
              (wallet?.reservedStake ?? 0) + (wallet?.reservedWithdrawal ?? 0)
            )}
            {(wallet?.reservedStake ?? 0) > 0
              ? ` · stakes ${formatMoney(wallet?.reservedStake ?? 0)}`
              : ""}
            {(wallet?.reservedWithdrawal ?? 0) > 0
              ? ` · withdrawal ${formatMoney(wallet?.reservedWithdrawal ?? 0)}`
              : ""}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/account/deposit"
            className="flex items-center justify-center rounded-xl bg-white px-2 py-2.5 text-xs font-semibold text-brand"
          >
            Buy points
          </Link>
          <Link
            href="/account/withdraw"
            className="flex items-center justify-center rounded-xl border border-white/40 px-2 py-2.5 text-xs font-semibold text-white"
          >
            Withdraw
          </Link>
        </div>
        <p className="mt-3 text-[10px] text-white/45">1 point = ₦1</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        <Link
          href="/account/deposit"
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface p-3 shadow-card"
        >
          <span className="text-xl">💳</span>
          <span className="text-[11px] font-medium">Buy points</span>
        </Link>
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
              <p className="text-[11px] text-ink-muted">Available to bet</p>
              <p
                className="truncate font-display text-base font-bold tabular-nums text-brand"
                title={"₦" + availableToBet(wallet).toLocaleString("en-NG")}
              >
                {formatMoney(availableToBet(wallet))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menu */}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <MenuItem icon="💳" label="Buy points" href="/account/deposit" />
        <MenuItem icon="🏦" label="Withdraw" href="/account/withdraw" />
        <MenuItem icon="👤" label="Profile" href="/account/profile" />
        <MenuItem icon="🎫" label="Bet history" href="/bets" />
        <MenuItem icon="📋" label="Transaction records" href="/transactions" />
        <MenuItem icon="⚙️" label="Settings" href="/account/settings" />
        <MenuItem icon="🔍" label="Verify ticket" href="/verify" />
        <MenuItem icon="💬" label="Support & partners" href="/support" />
        <MenuItem icon="📖" label="Help & legal" href="/info" />
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
