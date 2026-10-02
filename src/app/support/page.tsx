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

type Msg = {
  id: string;
  from: "user" | "admin" | "bot";
  body: string;
  createdAt: number;
};

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  closeReason?: string | null;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
};

type Topic = {
  id: string;
  label: string;
  icon: string;
  intro: string;
  tips: string[];
};

const TOPICS: Topic[] = [
  {
    id: "deposits",
    label: "Deposits",
    icon: "💳",
    intro: "About buying points / deposits",
    tips: [
      "Minimum purchase is 200 points (₦200). 1 point = ₦1.",
      "After Flutterwave shows success, you should return to your Account page with a green “Payment successful” banner.",
      "If points are missing, wait 2–5 minutes, then open Transactions → Deposits and pull to refresh Account.",
      "Welcome / promo bonus (if any) only applies when the promo rules say so — usually once per account.",
      "Never send money outside the official Buy points → Flutterwave checkout flow.",
    ],
  },
  {
    id: "withdrawals",
    label: "Withdrawals",
    icon: "🏦",
    intro: "About cashing out",
    tips: [
      "Only Withdrawable cash can leave to your bank. Promo / bonus is never withdrawable.",
      "Limits: minimum ₦1,000 per request; maximum ₦50,000 per request per day.",
      "Open bets lock stake. Available to bet can be higher than Withdrawable while bets are running.",
      "After you request a withdrawal, status is Pending until an admin marks it paid (bank transfer).",
      "Use the same bank account name that matches your profile details when possible.",
      "Check Transactions → Withdrawals for “requested” vs “completed”.",
    ],
  },
  {
    id: "bets",
    label: "Bets & results",
    icon: "⚽",
    intro: "About tickets, scores, and settlement",
    tips: [
      "Open tickets stay Open until every leg is finished (or one leg loses on an accumulator — then the whole acca is Lost).",
      "Live scores update from admin / external sync; refresh My Bets if a score looks stale.",
      "Won tickets credit cash points to your wallet; check Transactions → Wins.",
      "You can open ticket details from My Bets for stake, odds, potential, and final score.",
      "Verify a ticket ID anytime from Account → Verify ticket.",
    ],
  },
  {
    id: "account",
    label: "Account & wallet",
    icon: "🔒",
    intro: "Balance, login, and security",
    tips: [
      "Available to bet = free cash + free promo (not locked in open bets or pending withdrawals).",
      "Withdrawable = cash only, after locks. Promo total is shown separately and cannot be withdrawn.",
      "“Locked now” on the dashboard shows stakes and pending withdrawals holding your funds.",
      "Keep your login private. We will never ask for your password in chat.",
      "Profile and bank details: Account → Profile / Withdraw.",
    ],
  },
  {
    id: "promo",
    label: "Promo & bonus",
    icon: "🎁",
    intro: "Bonus points and promo codes",
    tips: [
      "Promo balance is for betting under the rules of that promo — it is not withdrawable.",
      "Welcome-style promos often need exactly 5 × 1X2 picks, each at odds ≥ 2.00. Check the promo terms when you load a code.",
      "On the bet slip, choose promo when the ticket meets the rules; otherwise stake uses normal balance.",
      "Admin can issue extra promos; each may have different terms.",
      "If a code fails, it may be used up, expired, or already redeemed on your account.",
    ],
  },
  {
    id: "booking",
    label: "Booking codes",
    icon: "📋",
    intro: "Share or load a booking code",
    tips: [
      "From the bet slip, Book creates a code you can copy or share (e.g. WhatsApp).",
      "Friends load the code on the bet slip to get the same selections (if matches are still open).",
      "Codes for finished matches cannot be loaded — you’ll see that selections are no longer valid.",
      "Booking a code does not place a bet; each user still stakes from their own wallet.",
      "Settled tickets use ticket ID for verify — not booking codes.",
    ],
  },
  {
    id: "other",
    label: "Something else",
    icon: "💬",
    intro: "Other questions",
    tips: [
      "Help & legal (terms, privacy, how to play) is under Account → Help & legal.",
      "Partners and sponsors appear on this Support page when published.",
      "For urgent money issues, pick Deposits or Withdrawals so we can prioritise.",
    ],
  },
];

export default function SupportPage() {
  const { user } = useAuth();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [step, setStep] = useState<"home" | "bot" | "compose" | "thread">(
    "home"
  );
  const [topic, setTopic] = useState<Topic | null>(null);
  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const active = tickets.find((t) => t.id === activeId) ?? null;

  function goHome() {
    setStep("home");
    setTopic(null);
    setActiveId(null);
    setMessage("");
    setErr(null);
  }

  async function startAgentChat() {
    if (!user || !topic || message.trim().length < 2) return;
    setSending(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: topic.id,
          body: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start chat");
      setMessage("");
      await loadTickets();
      setActiveId(data.id);
      setStep("thread");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setSending(false);
    }
  }

  async function replyTicket() {
    if (!user || !activeId || message.trim().length < 1) return;
    setSending(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketId: activeId, body: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send");
      setMessage("");
      await loadTickets();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  function bubble(m: Msg) {
    const isUser = m.from === "user";
    const isBot = m.from === "bot";
    return (
      <div
        key={m.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
            isUser
              ? "bg-brand text-white"
              : isBot
                ? "bg-ink-muted/10 text-ink"
                : "bg-bg text-ink"
          }`}
        >
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p
            className={`mt-1 text-[10px] ${
              isUser ? "text-white/70" : "text-ink-muted"
            }`}
          >
            {isUser ? "You" : isBot ? "Help bot" : "Agent"} ·{" "}
            {new Date(m.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          className="text-lg"
          aria-label="Back"
          onClick={() => {
            if (step === "home") {
              window.location.href = "/dashboard";
            } else {
              goHome();
            }
          }}
        >
          ←
        </button>
        <h1 className="font-display text-lg font-bold">
          {step === "home"
            ? "Support"
            : step === "bot"
              ? topic?.label ?? "Help"
              : step === "compose"
                ? "Talk to an agent"
                : active?.subject || "Chat"}
        </h1>
      </div>

      {/* HOME */}
      {step === "home" && (
        <>
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="text-sm text-ink-muted">
              Hi — I&apos;m the FUNAAB BetSim help bot. Pick a topic for quick
              tips, or open a past request.
            </p>
            {!user && (
              <p className="mt-2 text-sm">
                <Link href="/login" className="font-semibold text-brand">
                  Sign in
                </Link>{" "}
                to chat with an agent.
              </p>
            )}
            <ul className="mt-3 space-y-1.5">
              {TOPICS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(t);
                      setStep("bot");
                      setErr(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl bg-bg px-3 py-3 text-left text-sm font-medium active:bg-ink-muted/10"
                  >
                    <span className="text-lg">{t.icon}</span>
                    <span className="flex-1">{t.label}</span>
                    <span className="text-ink-muted">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {user && tickets.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-ink-muted">
                My requests
              </p>
              {tickets.map((t) => {
                const last = t.messages?.[t.messages.length - 1];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveId(t.id);
                      setStep("thread");
                      setErr(null);
                    }}
                    className="flex w-full flex-col rounded-2xl bg-surface p-4 text-left shadow-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{t.subject}</span>
                      <span className="text-[10px] font-bold uppercase text-ink-muted">
                        {t.status.replace("_", " ")}
                      </span>
                    </div>
                    {last && (
                      <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                        {last.from === "admin"
                          ? "Agent: "
                          : last.from === "bot"
                            ? "Bot: "
                            : ""}
                        {last.body}
                      </p>
                    )}
                  </button>
                );
              })}
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
                        className="h-12 w-12 rounded-lg bg-bg object-contain"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg text-xs font-bold">
                        {s.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="text-[11px] text-ink-muted">{s.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* BOT TIPS */}
      {step === "bot" && topic && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="text-sm font-medium text-ink-muted">{topic.intro}</p>
            <ul className="mt-3 space-y-2">
              {topic.tips.map((tip, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-xl bg-bg px-3 py-2.5 text-sm"
                >
                  <span className="font-bold text-brand">{i + 1}.</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="text-sm text-ink-muted">
              Did this solve it? If not, you can talk to a human agent.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={goHome}
                className="w-full rounded-xl border border-ink-muted/20 py-2.5 text-sm font-semibold"
              >
                Thanks — I&apos;m good
              </button>
              <button
                type="button"
                disabled={!user}
                onClick={() => {
                  setStep("compose");
                  setMessage("");
                  setErr(null);
                }}
                className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Talk to an agent
              </button>
              {!user && (
                <p className="text-center text-xs text-ink-muted">
                  <Link href="/login" className="text-brand">
                    Sign in
                  </Link>{" "}
                  required to reach an agent
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMPOSE TO AGENT */}
      {step === "compose" && topic && (
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <p className="text-sm text-ink-muted">
            Topic:{" "}
            <span className="font-semibold text-ink">{topic.label}</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Describe what you already tried. Include amount, time, or ticket ID
            if relevant. Chat closes after 1 hour of no reply from you.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message to an agent…"
            rows={5}
            maxLength={2000}
            disabled={sending}
            className="mt-3 w-full resize-none rounded-xl border border-ink-muted/15 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          {err && <p className="mt-2 text-sm text-loss">{err}</p>}
          <button
            type="button"
            disabled={sending || message.trim().length < 2}
            onClick={() => void startAgentChat()}
            className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Starting…" : "Start chat with agent"}
          </button>
        </div>
      )}

      {/* THREAD */}
      {step === "thread" && active && (
        <div className="flex flex-col rounded-2xl bg-surface shadow-card">
          <div className="border-b border-ink-muted/10 px-4 py-2 text-xs text-ink-muted">
            {active.status.replace("_", " ")}
            {active.closeReason ? ` · ${active.closeReason}` : ""} ·{" "}
            {active.category}
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto px-3 py-3">
            {(active.messages ?? []).map((m) => bubble(m))}
          </div>
          {active.status !== "closed" ? (
            <div className="flex gap-2 border-t border-ink-muted/10 p-3">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
                className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void replyTicket();
                  }
                }}
              />
              <button
                type="button"
                disabled={sending || !message.trim()}
                onClick={() => void replyTicket()}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          ) : (
            <div className="space-y-2 border-t border-ink-muted/10 px-4 py-3 text-center">
              <p className="text-xs text-ink-muted">
                This chat is closed
                {active.closeReason === "idle"
                  ? " (1 hour inactive)"
                  : ""}
                . Start a new request from Support home.
              </p>
              <button
                type="button"
                onClick={goHome}
                className="text-sm font-semibold text-brand"
              >
                Back to Support
              </button>
            </div>
          )}
          {err && <p className="px-4 pb-3 text-sm text-loss">{err}</p>}
        </div>
      )}
    </main>
  );
    }
                        
