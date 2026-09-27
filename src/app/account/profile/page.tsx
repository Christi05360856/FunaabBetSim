"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">Profile</h1>
      </header>

      <div className="flex flex-col items-center gap-2 px-4 pt-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/15 font-display text-3xl font-bold text-brand">
          {(user.displayName ?? "P").charAt(0).toUpperCase()}
        </div>
        <p className="font-display text-lg font-bold">
          {user.displayName ?? "Player"}
        </p>
        <p className="text-sm text-ink-muted">{user.email}</p>
      </div>

      <div className="mx-4 mt-6 overflow-hidden rounded-2xl bg-surface shadow-card">
        <Info label="Display name" value={user.displayName ?? "—"} />
        <Info label="Email" value={user.email ?? "—"} />
        <Info label="User ID" value={user.uid.slice(0, 12) + "…"} mono />
      </div>

      <p className="mx-4 mt-4 text-center text-[11px] text-ink-muted">
        FUNAAB BetSim is a play-money simulation. Profile data is only used
        inside this app.
      </p>
    </main>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-ink-muted/10 px-4 py-3.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span
        className={
          "max-w-[60%] truncate text-sm font-medium " +
          (mono ? "font-mono text-xs" : "")
        }
      >
        {value}
      </span>
    </div>
  );
}
