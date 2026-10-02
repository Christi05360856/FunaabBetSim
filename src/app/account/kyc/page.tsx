"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

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

type KycStatus = "none" | "pending" | "verified" | "rejected";

export default function KycPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<KycStatus>("none");
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCode, setBankCode] = useState("058");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [nin, setNin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/kyc", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setStatus((data.status as KycStatus) || "none");
          setRecord(data.record ?? null);
          if (data.record) {
            setLegalName(String(data.record.legalName ?? ""));
            setPhone(String(data.record.phone ?? ""));
            setBankCode(String(data.record.bankCode ?? "058"));
            setAccountNumber(String(data.record.accountNumber ?? ""));
            setAccountName(String(data.record.accountName ?? ""));
          }
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          legalName,
          phone,
          bankCode,
          accountNumber,
          accountName,
          nin: nin.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      setStatus("pending");
      setRecord({ legalName, phone, bankCode, accountNumber, accountName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !loaded) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-sm text-ink-muted">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Verify identity</h1>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-4 text-sm shadow-card">
        <p className="text-ink-muted">
          Withdrawals require verified identity. Use the same name and bank
          account you will cash out to. NIN is optional for now but recommended.
        </p>
        <p className="mt-2 text-xs font-semibold uppercase text-ink-muted">
          Status:{" "}
          <span
            className={
              status === "verified"
                ? "text-brand"
                : status === "rejected"
                  ? "text-loss"
                  : "text-ink"
            }
          >
            {status}
          </span>
        </p>
        {status === "pending" && (
          <p className="mt-1 text-sm text-ink-muted">
            Submitted — an admin will review shortly. You cannot withdraw until
            verified.
          </p>
        )}
        {status === "verified" && record && (
          <p className="mt-1 text-sm">
            Verified for {String(record.accountName)} ·{" "}
            {String(record.accountNumber)}. Withdrawals must use this bank.
          </p>
        )}
        {status === "rejected" && (
          <p className="mt-1 text-sm text-loss">
            Previous submission was rejected. Correct details and submit again.
          </p>
        )}
      </div>

      {(status === "none" || status === "rejected") && (
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-2xl bg-surface p-4 shadow-card"
        >
          <label className="block text-sm font-medium">
            Full legal name
            <input
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
          <label className="block text-sm font-medium">
            Phone
            <input
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="080…"
              required
              inputMode="tel"
            />
          </label>
          <label className="block text-sm font-medium">
            Bank
            <select
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
            >
              {BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Account number
            <input
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              inputMode="numeric"
              maxLength={10}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Account name (as on bank)
            <input
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            NIN <span className="font-normal text-ink-muted">(optional)</span>
            <input
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={nin}
              onChange={(e) => setNin(e.target.value)}
              inputMode="numeric"
              maxLength={11}
              placeholder="11 digits"
            />
          </label>
          {error && <p className="text-sm text-loss">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit for verification"}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm">
        <Link href="/account/withdraw" className="font-semibold text-brand">
          Back to withdraw
        </Link>
      </p>
    </main>
  );
}
