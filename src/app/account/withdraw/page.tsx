"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { withdrawableBalance } from "@/lib/domain/wallet";
import { MAX_WITHDRAWAL, MIN_WITHDRAWAL } from "@/types/domain";

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

type KycInfo = {
  status: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
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
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [kyc, setKyc] = useState<KycInfo | null>(null);
  const [kycLoading, setKycLoading] = useState(true);
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
  const list = showPendingOnly ? pendingItems : history.slice(0, 8);
  const kycVerified = kyc?.status === "verified";
  const locked = kycVerified;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const [wRes, kRes, pRes] = await Promise.all([
          fetch("/api/withdrawals", {
            headers: { Authorization: "Bearer " + token },
          }),
          fetch("/api/kyc", {
            headers: { Authorization: "Bearer " + token },
          }),
          fetch("/api/security/pin", {
            headers: { Authorization: "Bearer " + token },
          }),
        ]);
        const wBody = await wRes.json().catch(() => ({}));
        if (wRes.ok) setHistory(wBody.items ?? []);
        const kBody = await kRes.json().catch(() => ({}));
        if (kRes.ok) {
          const rec = (kBody.record ?? kBody.kyc ?? kBody) as KycInfo;
          if (rec && typeof rec === "object") {
            setKyc({
              status: String(rec.status ?? kBody.status ?? "none"),
              bankCode: rec.bankCode ? String(rec.bankCode) : undefined,
              accountNumber: rec.accountNumber
                ? String(rec.accountNumber)
                : undefined,
              accountName: rec.accountName
                ? String(rec.accountName)
                : undefined,
            });
            if (String(rec.status ?? kBody.status) === "verified") {
              if (rec.bankCode) setBankCode(String(rec.bankCode));
              if (rec.accountNumber)
                setAccountNumber(String(rec.accountNumber));
              if (rec.accountName) setAccountName(String(rec.accountName));
            }
          }
        }
        const pBody = await pRes.json().catch(() => ({}));
        if (pRes.ok) setHasPin(Boolean(pBody.hasPin));
      } catch {
        /* ignore */
      } finally {
        setKycLoading(false);
      }
    })();
  }, [user, success]);

  async function submit() {
    if (!user) return;
    if (!kycVerified) {
      setError("Complete KYC verification before withdrawing.");
      return;
    }
    const amt = Math.round(Number(amount));
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const token = await user.getIdToken(true);
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
          pin,
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

  if (loading || wLoading || kycLoading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-28">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-ink-muted">
          ← Account
        </Link>
        <button
          type="button"
          onClick={() => setShowPendingOnly((v) => !v)}
          className="text-xs font-semibold text-brand"
        >
          {showPendingOnly ? "New request" : "Pending"}
        </button>
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <p className="text-2xl font-bold text-brand">
          ₦{free.toLocaleString("en-NG")}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Promo points cannot be withdrawn. Min ₦
          {MIN_WITHDRAWAL.toLocaleString("en-NG")} · Max ₦
          {MAX_WITHDRAWAL.toLocaleString("en-NG")} / day
        </p>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <p className="font-semibold text-amber-200">Security</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-muted">
          <li>
            Sign in again if you have been logged in a long time — withdrawals
            need a recent session.
          </li>
          <li>New accounts wait about 1 hour before the first withdrawal.</li>
          <li>
            Payout bank is locked to your <strong>verified KYC</strong> account
            name, bank and number — you cannot change the beneficiary here.
          </li>
          <li>Never share your password. Staff will never ask for it.</li>
        </ul>
      </div>

      {!showPendingOnly && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
          {!kycVerified && (
            <div className="rounded-xl bg-loss/10 px-3 py-2 text-sm text-loss">
              KYC is required before withdrawals.{" "}
              <Link href="/account/kyc" className="font-semibold underline">
                Verify identity
              </Link>
            </div>
          )}

          <label className="block text-xs text-ink-muted">
            Amount (₦)
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
              placeholder={String(MIN_WITHDRAWAL)}
            />
          </label>

          <label className="block text-xs text-ink-muted">
            Bank
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={locked}
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm disabled:opacity-70"
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
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              disabled={locked}
              maxLength={10}
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm disabled:opacity-70"
            />
          </label>

          <label className="block text-xs text-ink-muted">
            Account name (verified KYC)
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={locked}
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm disabled:opacity-70"
            />
          </label>


          {!hasPin && kycVerified && (
            <div className="rounded-xl bg-loss/10 px-3 py-2 text-sm text-loss">
              Set a withdrawal PIN first.{" "}
              <Link href="/account/settings/pin" className="font-semibold underline">
                Set PIN
              </Link>
            </div>
          )}

          {hasPin && (
            <label className="block text-xs text-ink-muted">
              Withdrawal PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em]"
              />
            </label>
          )}

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
            disabled={busy || free < MIN_WITHDRAWAL || !kycVerified || !hasPin || pin.length !== 4}
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
