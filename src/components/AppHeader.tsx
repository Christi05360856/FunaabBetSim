"use client";

/**
 * Persistent top bar — logo + sports balance (or Log in).
 * On /casino routes we hide the sports ₦ pill so demo chips stay distinct.
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

  const isCasino = pathname?.startsWith("/casino") ?? false;

  return (
    <header className="sticky top-0 z-30 border-b border-ink-muted/15 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
            F
          </span>
          <span className="font-display text-base font-semibold tracking-tight">
            FUNAAB BetSim
          </span>
        </Link>

        {isCasino ? (
          <span className="rounded-full border border-brand/25 bg-brand/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brand">
            Demo play
          </span>
        ) : user ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent"
          >
            <span className="opacity-70">₦</span>
            {wallet ? wallet.balance.toLocaleString("en-NG") : "···"}
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
