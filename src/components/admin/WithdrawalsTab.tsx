"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { Button, Card, EmptyState } from "./ui";

type WItem = {
  id: string;
  uid: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  status: string;
  adminNote: string | null;
  createdAt: number;
};

const BANK_NAMES: Record<string, string> = {
  "058": "GTBank",
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

export default function WithdrawalsTab() {
  const [items, setItems] = useState<WItem[]>([]);
  const [filter, setFilter] = useState("pending_review");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/admin/withdrawals?status=${encodeURIComponent(filter)}`,
      { headers: { Authorization: "Bearer " + token } }
    );
    const body = await res.json();
    if (res.ok) setItems(body.items ?? []);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    id: string,
    action: "approve-manual" | "approve-flw" | "reject"
  ) {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(id);
    setMsg(null);
    try {
      const token = await user.getIdToken();
      if (action === "reject") {
        const res = await fetch("/api/admin/withdrawals/reject", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ withdrawalId: id, note: "Rejected" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Reject failed");
        setMsg("Rejected");
      } else {
        const res = await fetch("/api/admin/withdrawals/approve", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            withdrawalId: id,
            mode: action === "approve-flw" ? "flutterwave" : "manual",
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Approve failed");
        setMsg(
          action === "approve-flw"
            ? "Flutterwave transfer + completed"
            : "Marked paid (manual)"
        );
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Withdrawals</h2>
          <p className="text-sm text-adm-muted">
            Prefer <strong>Mark paid</strong> until Flutterwave transfers are
            verified. FLW may require IP whitelist.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-adm-border bg-adm-card px-3 py-2 text-sm"
        >
          <option value="pending_review">Pending</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="payment_failed">Payment failed</option>
          <option value="all">All</option>
        </select>
      </div>

      {msg && (
        <p className="rounded-lg bg-adm-card px-3 py-2 text-sm">{msg}</p>
      )}

      {items.length === 0 ? (
        <EmptyState title="No withdrawals" hint="Nothing in this filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-adm-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-adm-card text-xs uppercase text-adm-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="border-t border-adm-border">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{w.accountName}</p>
                    <p className="text-[10px] text-adm-muted">
                      {w.uid.slice(0, 10)}…
                    </p>
                  </td>
                  <td className="px-3 py-2.5 font-bold tabular-nums">
                    ₦{w.amount.toLocaleString("en-NG")}
                  </td>
                  <td className="px-3 py-2.5">
                    {BANK_NAMES[w.bankCode] ?? w.bankCode}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {w.accountNumber}
                  </td>
                  <td className="px-3 py-2.5 capitalize">
                    {w.status.replace(/_/g, " ")}
                    {w.adminNote && (
                      <p className="text-[10px] text-adm-bad">{w.adminNote}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {(w.status === "pending_review" ||
                      w.status === "payment_failed") && (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          disabled={busy === w.id}
                          onClick={() => void act(w.id, "approve-manual")}
                        >
                          Mark paid
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === w.id}
                          onClick={() => void act(w.id, "approve-flw")}
                        >
                          FLW
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === w.id}
                          onClick={() => void act(w.id, "reject")}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
