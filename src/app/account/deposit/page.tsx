"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { MIN_DEPOSIT_NGN } from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";

const CHIPS = [200, 500, 1000, 2000, 5000] as const;

export default function DepositPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { wallet } = useWallet();
  const [amount, setAmount] = useState<number>(200);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  function selectChip(n: number) {
    setAmount(n);
    setCustom("");
    setError(null);
  }

  function onCustomChange(v: string) {
    setCustom(v);
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n > 0) setAmount(n);
  }

  async function startDeposit() {
    if (!user) return;
    const pay = Math.round(amount);
    if (!Number.isFinite(pay) || pay < MIN_DEPOSIT_NGN) {
      setError(`Minimum is ₦${MIN_DEPOSIT_NGN}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/payments/deposit/init", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + idToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountNgn: pay }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Could not start payment");
      }
      if (!body.checkoutUrl) {
        throw new Error("No checkout link returned");
      }
      // Leave the app → Flutterwave
      window.location.href = body.checkoutUrl as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
      setBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pb-28 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Buy points</h1>
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="text-xs text-ink-muted">Current balance</p>
        <p className="font-display text-xl font-bold text-brand">
          {wallet ? formatMoney(wallet.balance) : "—"}
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">1 point = ₦1</p>
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Choose amount
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CHIPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => selectChip(n)}
              className={`rounded-xl px-2 py-3 text-sm font-semibold ${
                amount === n && !custom
                  ? "bg-brand text-white"
                  : "bg-bg text-ink"
              }`}
            >
              ₦{n.toLocaleString("en-NG")}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs text-ink-muted">
          Or enter amount (min ₦{MIN_DEPOSIT_NGN})
          <input
            type="number"
            inputMode="numeric"
            min={MIN_DEPOSIT_NGN}
            value={custom}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder={String(MIN_DEPOSIT_NGN)}
            className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
          />
        </label>

        <p className="mt-3 text-sm">
          You will get{" "}
          <span className="font-bold text-brand">
            {Math.max(0, Math.round(amount)).toLocaleString("en-NG")} points
          </span>
        </p>

        {error && (
          <p className="mt-2 text-sm text-loss" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={startDeposit}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Opening payment…" : "Continue to payment"}
        </button>
      </div>

      <p className="text-center text-[11px] text-ink-muted">
        Paid securely via Flutterwave. Points are credited after payment is
        confirmed.
      </p>
    </main>
  );
}

