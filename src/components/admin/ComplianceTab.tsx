"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

type KycRow = {
  uid: string;
  email?: string | null;
  legalName?: string;
  phone?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  nin?: string | null;
  status?: string;
  submittedAt?: number;
  rejectReason?: string | null;
};

type AuditRow = {
  id: string;
  adminUid: string;
  adminEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
  createdAt: number;
};

const BANKS: Record<string, string> = {
  "058": "GTB",
  "033": "UBA",
  "011": "First Bank",
  "044": "Access",
  "057": "Zenith",
  "032": "Union",
  "221": "Stanbic",
  "050": "Ecobank",
  "070": "Fidelity",
  "232": "Sterling",
  "076": "Polaris",
  "035": "Wema",
  "215": "Unity",
  "101": "Providus",
  "999": "Opay",
  "100004": "PalmPay",
};

export default function ComplianceTab() {
  const { user } = useAuth();
  const [section, setSection] = useState<"kyc" | "audit">("kyc");
  const [kycFilter, setKycFilter] = useState("pending");
  const [kycItems, setKycItems] = useState<KycRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);

  const loadKyc = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/kyc?status=${encodeURIComponent(kycFilter)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setKycItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [user, kycFilter]);

  const loadAudit = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAudit(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (section === "kyc") void loadKyc();
    else void loadAudit();
  }, [section, loadKyc, loadAudit]);

  async function review(uid: string, status: "verified" | "rejected") {
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/kyc", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid,
          status,
          totpCode: totp || undefined,
          reason: status === "rejected" ? "Details could not be verified" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await loadKyc();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Compliance</h2>
        <p className="text-sm text-adm-faint">
          KYC review and admin action audit log.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSection("kyc")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            section === "kyc" ? "bg-brand text-white" : "bg-adm-surface text-adm-faint"
          }`}
        >
          KYC queue
        </button>
        <button
          type="button"
          onClick={() => setSection("audit")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            section === "audit" ? "bg-brand text-white" : "bg-adm-surface text-adm-faint"
          }`}
        >
          Audit log
        </button>
      </div>

      {err && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{err}</p>
      )}

      {section === "kyc" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {["pending", "verified", "rejected"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setKycFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  kycFilter === s ? "bg-sky-600 text-white" : "bg-adm-surface text-adm-faint"
                }`}
              >
                {s}
              </button>
            ))}
            <input
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              placeholder="Admin TOTP (if enabled)"
              className="ml-auto rounded-lg border border-adm-border bg-adm-bg px-2 py-1 text-xs"
            />
          </div>

          {loading ? (
            <p className="text-sm text-adm-faint">Loading…</p>
          ) : kycItems.length === 0 ? (
            <p className="text-sm text-adm-faint">No records.</p>
          ) : (
            <ul className="space-y-3">
              {kycItems.map((k) => (
                <li
                  key={k.uid}
                  className="rounded-xl border border-adm-border bg-adm-surface p-4 text-sm"
                >
                  <p className="font-semibold">{k.legalName}</p>
                  <p className="text-xs text-adm-faint">
                    {k.email || k.uid} · {k.phone}
                  </p>
                  <p className="mt-1">
                    {BANKS[k.bankCode || ""] || k.bankCode} · {k.accountNumber} ·{" "}
                    {k.accountName}
                  </p>
                  {k.nin && (
                    <p className="text-xs text-adm-faint">NIN: {k.nin}</p>
                  )}
                  <p className="text-xs text-adm-faint">
                    Submitted{" "}
                    {k.submittedAt
                      ? new Date(k.submittedAt).toLocaleString()
                      : "—"}
                  </p>
                  {kycFilter === "pending" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(k.uid, "verified")}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(k.uid, "rejected")}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {k.rejectReason && (
                    <p className="mt-1 text-xs text-red-600">{k.rejectReason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {section === "audit" && (
        <>
          {loading ? (
            <p className="text-sm text-adm-faint">Loading…</p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-adm-faint">No audit entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {audit.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-adm-border bg-adm-surface px-3 py-2 text-xs"
                >
                  <p className="font-semibold">
                    {a.action} · {a.targetType}/{a.targetId}
                  </p>
                  <p className="text-adm-faint">
                    {a.adminEmail || a.adminUid} ·{" "}
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                  {a.meta && Object.keys(a.meta).length > 0 && (
                    <p className="mt-0.5 break-all text-adm-faint">
                      {JSON.stringify(a.meta)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
