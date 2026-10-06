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


function actionStyle(action: string): { label: string; cls: string } {
  const a = (action || "").toLowerCase();
  if (a.includes("force_early") || a.includes("early"))
    return { label: "FORCE EARLY", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  if (a.includes("settle") || a.includes("confirm"))
    return { label: "SETTLE", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" };
  if (a.includes("void"))
    return { label: "VOID", cls: "bg-slate-500/15 text-slate-600 border-slate-500/30" };
  if (a.includes("withdraw") || a.includes("payout") || a.includes("paid"))
    return { label: "WITHDRAWAL", cls: "bg-sky-500/15 text-sky-700 border-sky-500/30" };
  if (a.includes("kyc") || a.includes("verify"))
    return { label: "KYC", cls: "bg-violet-500/15 text-violet-700 border-violet-500/30" };
  if (a.includes("promo"))
    return { label: "PROMO", cls: "bg-pink-500/15 text-pink-700 border-pink-500/30" };
  if (a.includes("danger") || a.includes("reset") || a.includes("wipe"))
    return { label: "DANGER", cls: "bg-rose-500/15 text-rose-700 border-rose-500/30" };
  if (a.includes("cron"))
    return { label: "CRON", cls: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30" };
  return {
    label: (action || "ACTION").replace(/_/g, " ").toUpperCase().slice(0, 18),
    cls: "bg-adm-border/40 text-adm-ink border-adm-border",
  };
}

function humanAuditSummary(a: AuditRow): string {
  const m = a.meta || {};
  const parts: string[] = [];
  if (m.event != null) parts.push(String(m.event).replace(/_/g, " "));
  if (m.homeScore != null && m.awayScore != null)
    parts.push(`Score ${m.homeScore}–${m.awayScore}`);
  if (m.betsSettled != null) parts.push(`${m.betsSettled} bet(s) settled`);
  if (m.reason != null && String(m.reason).trim())
    parts.push(`“${String(m.reason).trim()}”`);
  if (m.amount != null) parts.push(`₦${Number(m.amount).toLocaleString("en-NG")}`);
  if (m.priorStatus != null) parts.push(`was ${m.priorStatus}`);
  if (parts.length) return parts.join(" · ");
  if (a.targetType || a.targetId)
    return `${a.targetType || "item"} · ${String(a.targetId).slice(0, 16)}`;
  return "Admin action recorded";
}

function formatWhen(ts: number): { rel: string; full: string } {
  const full = new Date(ts).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const s = Math.floor((Date.now() - ts) / 1000);
  let rel = full;
  if (s < 60) rel = `${s}s ago`;
  else if (s < 3600) rel = `${Math.floor(s / 60)}m ago`;
  else if (s < 86400) rel = `${Math.floor(s / 3600)}h ago`;
  else if (s < 86400 * 7) rel = `${Math.floor(s / 86400)}d ago`;
  return { rel, full };
}


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
            <ul className="space-y-3">
              {audit.map((a) => {
                const style = actionStyle(a.action);
                const when = formatWhen(a.createdAt);
                const summary = humanAuditSummary(a);
                const who = a.adminEmail || (a.adminUid ? a.adminUid.slice(0, 12) + "…" : "Admin");
                const target =
                  a.targetType || a.targetId
                    ? `${a.targetType || "target"}${a.targetId ? " · " + String(a.targetId).slice(0, 20) : ""}`
                    : null;
                return (
                  <li
                    key={a.id}
                    className="rounded-2xl border border-adm-border bg-adm-surface p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span
                        className={
                          "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold tracking-wide " +
                          style.cls
                        }
                      >
                        {style.label}
                      </span>
                      <div className="text-right">
                        <p className="text-[11px] font-semibold text-adm-ink">{when.rel}</p>
                        <p className="text-[10px] text-adm-faint">{when.full}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-snug text-adm-ink">
                      {summary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-adm-faint">
                      <span className="font-medium text-adm-muted">{who}</span>
                      {target && (
                        <>
                          <span className="text-adm-border">|</span>
                          <span className="font-mono text-[10px]">{target}</span>
                        </>
                      )}
                    </div>
                    {a.meta && Object.keys(a.meta).length > 0 && (
                      <details className="mt-2 group">
                        <summary className="cursor-pointer select-none text-[11px] font-semibold text-brand">
                          View technical details
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-xl bg-adm-bg p-2 text-[10px] leading-relaxed text-adm-muted break-all whitespace-pre-wrap">
                          {JSON.stringify(a.meta, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
  
