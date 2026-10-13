"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { Button, Card, EmptyState } from "./ui";

type DItem = {
  id: string;
  txRef: string;
  uid: string;
  amountNgn: number;
  points: number;
  promoCode: string | null;
  status: string;
  flwTransactionId: string | null;
  flwRef: string | null;
  createdAt: number;
  completedAt: number | null;
  recovered?: boolean;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "success", label: "Success" },
  { id: "initiated", label: "Initiated" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
] as const;

function fmtTime(ms: number) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("en-NG", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function statusColor(s: string) {
  if (s === "success") return "text-emerald-400";
  if (s === "failed" || s === "abandoned") return "text-red-400";
  if (s === "pending" || s === "initiated") return "text-amber-400";
  return "text-zinc-400";
}

export default function DepositsTab() {
  const [items, setItems] = useState<DItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Recover form
  const [txRef, setTxRef] = useState("");
  const [flwId, setFlwId] = useState("");
  const [recoveryUid, setRecoveryUid] = useState("");

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/deposits?status=all`, {
      headers: { Authorization: "Bearer " + token },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setItems([]);
      setErr(body.error ?? "Failed to load deposits");
      return;
    }
    let list = (body.items ?? []) as DItem[];
    if (filter !== "all") {
      list = list.filter((d) => d.status === filter);
    }
    setItems(list);
    setErr(null);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recover() {
    const user = auth.currentUser;
    if (!user) return;
    if (!txRef.trim() && !flwId.trim()) {
      setErr("Enter booking tx ref (FB-…) and/or Flutterwave transaction id");
      return;
    }
    const totpCode =
      typeof window !== "undefined"
        ? window.prompt(
            "Admin authenticator code (6 digits). Leave blank if TOTP not configured."
          )
        : null;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/deposits/recover", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txRef: txRef.trim() || undefined,
          flwTransactionId: flwId.trim() || undefined,
          recoveryUid: recoveryUid.trim() || undefined,
          totpCode: totpCode || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Recover failed");
      setMsg(body.message ?? "Done");
      setTxRef("");
      setFlwId("");
      setRecoveryUid("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Recover failed");
    } finally {
      setBusy(false);
    }
  }

  async function recoverRow(d: DItem) {
    setTxRef(d.txRef);
    setFlwId(d.flwTransactionId ?? "");
    setRecoveryUid(d.uid);
    setMsg("Filled from row — confirm IDs, then tap Verify & credit");
  }

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h2 className="text-xl font-bold text-white">Deposits</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Track payments and credit users when Flutterwave shows paid but the
          app did not.
        </p>
      </div>

      <Card className="space-y-3 border border-zinc-800 bg-zinc-900/80 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          Verify & credit (support)
        </h3>
        <p className="text-xs text-zinc-500">
          Always re-checks Flutterwave. Use the FLW transaction id from the
          dashboard receipt when the user was charged but not credited.
        </p>
        <label className="block text-xs text-zinc-400">
          App tx ref (FB-…)
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={txRef}
            onChange={(e) => setTxRef(e.target.value)}
            placeholder="FB-xnaYgV-…"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Flutterwave transaction id
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={flwId}
            onChange={(e) => setFlwId(e.target.value)}
            placeholder="10000426…"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          User uid (only if deposit doc was wiped)
          <input
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={recoveryUid}
            onChange={(e) => setRecoveryUid(e.target.value)}
            placeholder="Firebase uid from FLW meta / support"
            autoComplete="off"
          />
        </label>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void recover()}
        >
          {busy ? "Working…" : "Verify & credit"}
        </Button>
      </Card>

      {msg && (
        <p className="rounded-lg bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
          {msg}
        </p>
      )}
      {err && (
        <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {err}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (filter === f.id
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-300")
            }
          >
            {f.label}
          </button>
        ))}
        <Button variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No deposits" hint="Try another filter or refresh." />
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <Card
              key={d.id}
              className="border border-zinc-800 bg-zinc-900/60 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-zinc-300 break-all">
                    {d.txRef}
                  </p>
                  <p className="mt-1 text-sm text-white">
                    ₦{d.amountNgn.toLocaleString("en-NG")}
                    <span className="ml-2 text-zinc-500">
                      → {d.points} pts
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    uid: {d.uid.slice(0, 8)}… · {fmtTime(d.createdAt)}
                    {d.recovered ? " · recovered" : ""}
                  </p>
                  {d.flwTransactionId && (
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                      FLW {d.flwTransactionId}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p
                    className={
                      "text-xs font-semibold uppercase " + statusColor(d.status)
                    }
                  >
                    {d.status}
                  </p>
                  {d.status !== "success" && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-emerald-400 underline"
                      onClick={() => void recoverRow(d)}
                    >
                      Fill recover form
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
