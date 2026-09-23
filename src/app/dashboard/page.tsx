"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Wallet } from "@/types/domain";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Client-side gate for Milestone 1. The dashboard shows no financial
  // truth beyond what /api/wallet (server-verified) returns, so a
  // logged-out flash here is a UX issue, not a security one.
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
        if (!response.ok) throw new Error("Could not load your wallet.");
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

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-muted">Welcome back</p>
          <h1 className="font-display text-2xl font-semibold">
            {user.displayName ?? "Player"}
          </h1>
        </div>
        <button onClick={logout} className="text-sm text-ink-muted underline">
          Log out
        </button>
      </div>

      <div className="rounded-xl bg-surface p-5 shadow-sm">
        <p className="text-sm text-ink-muted">Virtual balance</p>
        {walletError ? (
          <p className="mt-1 text-sm text-loss">{walletError}</p>
        ) : wallet ? (
          <p className="mt-1 font-display text-3xl text-accent">
            ₦{wallet.balance.toLocaleString("en-NG")}
          </p>
        ) : (
          <p className="mt-1 text-ink-muted">Loading…</p>
        )}
      </div>
    </main>
  );
}
