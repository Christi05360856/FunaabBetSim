"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

type Ticket = {
  id: string;
  uid: string;
  email: string | null;
  subject: string;
  body: string;
  status: string;
  adminNote: string | null;
  createdAt: number;
  updatedAt: number;
};

export default function TicketsTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const q = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`/api/admin/tickets${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(
    id: string,
    patch: { status?: string; adminNote?: string }
  ) {
    if (!user) return;
    setBusy(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Support tickets</h2>
        <p className="text-sm text-adm-faint">
          User messages from the Support page. Mark in progress or closed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { v: "", l: "All" },
          { v: "open", l: "Open" },
          { v: "in_progress", l: "In progress" },
          { v: "closed", l: "Closed" },
        ].map((f) => (
          <button
            key={f.v || "all"}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === f.v
                ? "bg-brand text-white"
                : "bg-adm-surface text-adm-faint"
            }`}
          >
            {f.l}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand"
        >
          Refresh
        </button>
      </div>

      {err && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {err}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-adm-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-adm-faint">No tickets yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-adm-border bg-adm-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.subject}</p>
                  <p className="text-xs text-adm-faint">
                    {t.email || t.uid} ·{" "}
                    {new Date(t.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    t.status === "open"
                      ? "bg-amber-500/15 text-amber-600"
                      : t.status === "closed"
                        ? "bg-zinc-500/15 text-zinc-500"
                        : "bg-sky-500/15 text-sky-600"
                  }`}
                >
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{t.body}</p>
              {t.adminNote && (
                <p className="mt-2 text-xs text-adm-faint">
                  Note: {t.adminNote}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {t.status !== "in_progress" && (
                  <button
                    type="button"
                    disabled={busy === t.id}
                    onClick={() =>
                      void update(t.id, { status: "in_progress" })
                    }
                    className="rounded-lg bg-sky-600/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    In progress
                  </button>
                )}
                {t.status !== "closed" && (
                  <button
                    type="button"
                    disabled={busy === t.id}
                    onClick={() => void update(t.id, { status: "closed" })}
                    className="rounded-lg bg-zinc-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Close
                  </button>
                )}
                {t.status === "closed" && (
                  <button
                    type="button"
                    disabled={busy === t.id}
                    onClick={() => void update(t.id, { status: "open" })}
                    className="rounded-lg border border-adm-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
