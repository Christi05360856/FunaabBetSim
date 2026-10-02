"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

type Sponsor = {
  id: string;
  name: string;
  logoUrl?: string | null;
  linkUrl?: string | null;
};

type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  createdAt: number;
  adminNote: string | null;
};

export default function SupportPage() {
  const { user } = useAuth();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/sponsors")
      .then((r) => r.json())
      .then((b) => {
        if (Array.isArray(b.items)) setSponsors(b.items);
      })
      .catch(() => {});
  }, []);

  const loadTickets = useCallback(async () => {
    if (!user) {
      setTickets([]);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/support/tickets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) setTickets(data.items);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setFormErr("Sign in to send a support message.");
      return;
    }
    setSending(true);
    setFormErr(null);
    setFormOk(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subject, body: message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send");
      setSubject("");
      setMessage("");
      setFormOk("Message sent. We will reply here when it is updated.");
      await loadTickets();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Support</h1>
      </div>

      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-card text-sm">
        <p className="text-ink-muted">
          Need help with deposits, withdrawals, or bets?
        </p>
        <p>
          <span className="font-semibold">WhatsApp / phone:</span>{" "}
          <span className="text-ink-muted">Coming soon</span>
        </p>
        <p>
          <span className="font-semibold">Hours:</span> Mon–Sat, 9:00–18:00 WAT
        </p>
      </div>

      {/* Ticket form */}
      <form
        onSubmit={submitTicket}
        className="mt-4 space-y-3 rounded-2xl bg-surface p-4 shadow-card"
      >
        <p className="text-xs font-semibold uppercase text-ink-muted">
          Send a message
        </p>
        {!user && (
          <p className="text-sm text-ink-muted">
            <Link href="/login" className="font-semibold text-brand">
              Sign in
            </Link>{" "}
            to contact support.
          </p>
        )}
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (e.g. Withdrawal delay)"
          maxLength={120}
          disabled={!user || sending}
          className="w-full rounded-xl border border-ink-muted/15 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the issue. Include ticket ID or amount if relevant."
          rows={4}
          maxLength={2000}
          disabled={!user || sending}
          className="w-full resize-none rounded-xl border border-ink-muted/15 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        {formErr && <p className="text-sm text-loss">{formErr}</p>}
        {formOk && <p className="text-sm text-brand">{formOk}</p>}
        <button
          type="submit"
          disabled={!user || sending}
          className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Submit ticket"}
        </button>
      </form>

      {/* My tickets */}
      {user && tickets.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-ink-muted">
            Your tickets
          </p>
          {tickets.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl bg-surface p-4 shadow-card text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{t.subject}</p>
                <span className="shrink-0 text-[10px] font-bold uppercase text-ink-muted">
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {new Date(t.createdAt).toLocaleString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-ink-muted">
                {t.body}
              </p>
              {t.adminNote && (
                <p className="mt-2 rounded-lg bg-brand/10 px-2 py-1.5 text-xs text-brand">
                  Support: {t.adminNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
          Official partners & sponsors
        </p>
        {sponsors.length === 0 ? (
          <p className="text-sm text-ink-muted">Coming soon.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {sponsors.map((s) => (
              <li key={s.id} className="flex flex-col items-center gap-1">
                {s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.logoUrl}
                    alt={s.name}
                    className="h-12 w-12 rounded-lg object-contain bg-bg"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg text-xs font-bold">
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {s.linkUrl ? (
                  <a
                    href={s.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-brand"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span className="text-[11px] text-ink-muted">{s.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
