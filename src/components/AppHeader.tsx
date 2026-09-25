"use client";

/**
 * Persistent top bar — logo, and either a live balance pill (logged in) or
 * a Log in link (guest). Sits in normal document flow (sticky, not fixed),
 * so no page needs extra top padding to compensate for it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";

const HIDDEN_PREFIXES = ["/admin", "/login", "/register"];

export default function AppHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { wallet } = useWallet();

  if (HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-ink-muted/15 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">F</span>
          <span className="font-display text-base font-semibold tracking-tight">FUNAAB BetSim</span>
        </Link>

        {user ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent"
          >
            <span className="opacity-70">₦</span>
            {wallet ? wallet.balance.toLocaleString("en-NG") : "···"}
          </Link>
        ) : (
          <Link href="/login" className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
