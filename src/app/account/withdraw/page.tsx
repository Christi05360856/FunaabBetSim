"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { withdrawableBalance } from "@/lib/domain/wallet";
import { MAX_WITHDRAWAL, MIN_WITHDRAWAL } from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";

const BANKS: { code: string; name: string }[] = [
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "033", name: "United Bank for Africa" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "044", name: "Access Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "032", name: "Union Bank" },
  { code: "221", name: "Stanbic IBTC" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "215", name: "Unity Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "999", name: "Opay" },
  { code: "100004", name: "PalmPay" },
];

type WRow = {
  id: string;
  amount: number;
  status: string;
  createdAt: number;
  bankCode?: string;
  accountNumber?: string;
};

const PENDING = new Set([
  "requested",
  "pending_review",
  "approved",
  "processing",
]);

export default function WithdrawPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { wallet, loading: wLoading } = useWallet();
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("058");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<WRow[]>([]);
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  const free = wallet ? withdrawableBalance(wallet) : 0;
  const pendingItems = useMemo(
    () => history.filter((h) => PENDING.has(h.status)),
    [history]
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/withdrawals", {
          headers: { Authorization: "Bearer " + token },
        });
        const body = await res.json();
        if (res.ok) setHistory(body.items ?? []);
      } catch {
        /* ignore */
      }
    })();
  }, [user, success]);

  async function submit() {
    if (!user) return;
    const amt = Math.round(Number(amount));
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const token = await user.getIdToken(true); // Phase 3: fresh token / auth_time
      const res = await fetch("/api/withdrawals/request", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amt,
          bankCode,
          accountNumber,
          accountName,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setSuccess(
        `Withdrawal of ₦${amt.toLocaleString("en-NG")} submitted. Pending admin review.`
      );
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
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

  const list = showPendingOnly ? pendingItems : history;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pb-28 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="flex-1 font-display text-lg font-bold">Withdraw</h1>

      <div className="mt-3 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-ink-muted">
        Withdrawals require verified identity.{" "}
        <Link href="/account/kyc" className="font-semibold text-brand">
          Verify identity →
        </Link>
      </div>

        {pendingItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPendingOnly((v) => !v)}
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-bold " +
              (showPendingOnly
                ? "bg-amber-500 text-white"
                : "bg-amber-100 text-amber-800")
            }
          >
            Pending ({pendingItems.length})
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="text-xs text-ink-muted">Withdrawable (cash only)</p>
        <p className="font-display text-xl font-bold text-brand">
          {wLoading ? "…" : formatMoney(free)}
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          Promo points cannot be withdrawn. Min ₦
          {MIN_WITHDRAWAL.toLocaleString("en-NG")} · Max ₦
          {MAX_WITHDRAWAL.toLocaleString("en-NG")} / day
        </p>
      </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950">
        <p className="font-bold">Security</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Sign in again if you have been logged in a long time — withdrawals need a recent session.</li>
          <li>New accounts wait about 1 hour before the first withdrawal.</li>
          <li>After your first request, payout bank stays locked to that account.</li>
          <li>Never share your password. Staff will never ask for it.</li>
        </ul>
      </div>

      {!showPendingOnly && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
          <label className="block text-xs text-ink-muted">
            Amount (₦)
            <input
              type="number"
              inputMode="numeric"
              min={MIN_WITHDRAWAL}
              max={Math.min(MAX_WITHDRAWAL, free)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(MIN_WITHDRAWAL)}
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block text-xs text-ink-muted">
            Bank
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
            >
              {BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-ink-muted">
            Account number (10 digits)
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm tracking-wider"
            />
          </label>

          <label className="block text-xs text-ink-muted">
            Account name (must match bank)
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="As on bank account"
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
            />
          </label>

          {error && (
            <p className="text-sm text-loss" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-brand" role="status">
              {success}
            </p>
          )}

          <button
            type="button"
            disabled={busy || free < MIN_WITHDRAWAL}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Request withdrawal"}
          </button>
        </div>
      )}

      {list.length > 0 && (
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
            {showPendingOnly ? "Pending requests" : "Recent requests"}
          </p>
          <ul className="space-y-2">
            {list.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-ink-muted">
                  {new Date(h.createdAt).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-semibold">
                  ₦{h.amount.toLocaleString("en-NG")}
                </span>
                <span className="text-xs capitalize text-ink-muted">
                  {h.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
          {showPendingOnly && (
            <button
              type="button"
              onClick={() => setShowPendingOnly(false)}
              className="mt-3 w-full text-center text-xs font-semibold text-brand"
            >
              Back to request form
            </button>
          )}
        </div>
      )}
    </main>
  );
}
