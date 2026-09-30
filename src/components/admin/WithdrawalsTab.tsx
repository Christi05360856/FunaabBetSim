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
            Review requests. Prefer Mark paid until Flutterwave transfers are
            verified in test.
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
        <EmptyState title="No withdrawals" description="Nothing in this filter." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((w) => (
            <Card key={w.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-bold">
                    ₦{w.amount.toLocaleString("en-NG")}
                  </p>
                  <p className="text-sm">
                    {w.accountName} · {w.accountNumber} · bank {w.bankCode}
                  </p>
                  <p className="text-xs text-adm-muted">
                    {w.uid.slice(0, 8)}… · {w.status} ·{" "}
                    {new Date(w.createdAt).toLocaleString()}
                  </p>
                  {w.adminNote && (
                    <p className="text-xs text-adm-bad">{w.adminNote}</p>
                  )}
                </div>
                {(w.status === "pending_review" ||
                  w.status === "payment_failed") && (
                  <div className="flex flex-wrap gap-2">
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
                      FLW transfer
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
