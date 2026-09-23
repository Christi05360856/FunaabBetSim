"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-wide text-accent">Play money only</p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-tight">
          FUNAAB BetSim
        </h1>
        <p className="mt-3 text-ink-muted">
          Practice reading odds and building bet slips on FUNAAB football
          fixtures — with a virtual ₦100,000 balance. No real money, ever.
        </p>
      </div>

      {loading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : user ? (
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand px-4 py-3 text-center font-medium text-white"
        >
          Go to dashboard
        </Link>
      ) : (
        <div className="flex flex-col gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-brand px-4 py-3 text-center font-medium text-white"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-ink-muted px-4 py-3 text-center font-medium"
          >
            Log in
          </Link>
        </div>
      )}
    </main>
  );
}
