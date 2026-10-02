"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

type Msg = {
  id: string;
  from: "user" | "admin" | "bot";
  body: string;
  createdAt: number;
};

type Ticket = {
  id: string;
  uid: string;
  email: string | null;
  subject: string;
  category: string;
  status: string;
  closeReason?: string | null;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
  body?: string;
};

export default function TicketsTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function setStatus(id: string, status: string) {
    if (!user) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(id: string) {
    if (!user || !reply.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, body: reply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reply failed");
      setReply("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  function threadMessages(t: Ticket): Msg[] {
    if (t.messages?.length) return t.messages;
    if (t.body) {
      return [
        { id: "legacy", from: "user", body: t.body, createdAt: t.createdAt },
      ];
    }
    return [];
  }

  function bubbleClass(from: string) {
    if (from === "admin") return "bg-brand text-white ml-auto";
    if (from === "bot") return "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100";
    return "bg-adm-bg text-adm-ink";
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Support tickets</h2>
        <p className="text-sm text-adm-faint">
          Users reach you after the help bot. Reply in the thread. Idle chats
          auto-close after 1 hour.
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
          {items.map((t) => {
            const expanded = openId === t.id;
            const msgs = threadMessages(t);
            const preview =
              msgs.length > 0 ? msgs[msgs.length - 1].body : t.subject;
            return (
              <li
                key={t.id}
                className="rounded-xl border border-adm-border bg-adm-surface p-4"
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                  onClick={() => {
                    setOpenId(expanded ? null : t.id);
                    setReply("");
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{t.subject}</p>
                    <p className="text-xs text-adm-faint">
                      {t.email || t.uid} · {t.category}
                      {t.closeReason ? ` · ${t.closeReason}` : ""} ·{" "}
                      {new Date(t.updatedAt || t.createdAt).toLocaleString()}
                    </p>
                    {!expanded && (
                      <p className="mt-1 line-clamp-2 text-sm text-adm-faint">
                        {preview}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      t.status === "open"
                        ? "bg-amber-500/15 text-amber-600"
                        : t.status === "closed"
                          ? "bg-zinc-500/15 text-zinc-500"
                          : "bg-sky-500/15 text-sky-600"
                    }`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </button>

                {expanded && (
                  <div className="mt-3 space-y-3 border-t border-adm-border pt-3">
                    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                      {msgs.map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${bubbleClass(
                            m.from
                          )} ${m.from === "admin" ? "self-end" : "self-start"}`}
                        >
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="mt-1 text-[10px] opacity-70">
                            {m.from === "admin"
                              ? "You"
                              : m.from === "bot"
                                ? "Bot"
                                : "User"}{" "}
                            · {new Date(m.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>

                    {t.status !== "closed" ? (
                      <div className="flex gap-2">
                        <input
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Reply as agent…"
                          disabled={busy}
                          className="min-w-0 flex-1 rounded-xl border border-adm-border bg-adm-bg px-3 py-2 text-sm outline-none focus:border-brand"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void sendReply(t.id);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy || !reply.trim()}
                          onClick={() => void sendReply(t.id)}
                          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Reply
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-adm-faint">
                        Closed
                        {t.closeReason ? ` (${t.closeReason})` : ""}. Reopen to
                        reply.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {t.status !== "in_progress" && t.status !== "closed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(t.id, "in_progress")}
                          className="rounded-lg bg-sky-600/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          In progress
                        </button>
                      )}
                      {t.status !== "closed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(t.id, "closed")}
                          className="rounded-lg bg-zinc-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Close
                        </button>
                      )}
                      {t.status === "closed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(t.id, "open")}
                          className="rounded-lg border border-adm-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
                      }
