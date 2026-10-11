"use client";

/**
 * Open Bets — the ticket you just placed, then "Keep Betting | Kick Off".
 * Laid out like the Instant Virtuals reference (white header, balance pill,
 * lavender ticket card, purple Kick Off).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  loadTicket,
  saveResult,
  type StoredTicket,
} from "@/lib/virtual/ticketStore";
import { MARKET_TITLE } from "@/lib/virtual/markets";
import { teamCode } from "@/lib/virtual/teamPool";
import { balanceText, money, ticketNumber } from "@/lib/virtual/format";
import { unlockAudio } from "@/lib/casino/sounds";

const PURPLE = "var(--color-brand)";

export default function VirtualTicketPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [ticket, setTicket] = useState<StoredTicket | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const t = loadTicket();
    if (!t) {
      router.replace("/virtual");
      return;
    }
    setTicket(t);
  }, [router]);

  // Show the live balance in the header pill.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/virtual/round", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && typeof data.balance === "number") {
          setBalance(data.balance);
        }
      } catch {
        /* header pill just stays blank */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function kickOff() {
    if (!user || !ticket || busy) return;
    unlockAudio();
    setBusy(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/virtual/settle", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roundId: ticket.roundId, kickoff: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kick off failed");

      const settled = (data.settled || []) as Array<{
        betId: string;
        status: "won" | "lost";
        payout: number;
        profit: number;
      }>;
      const totalWon = settled.reduce((a, s) => a + (s.payout || 0), 0);
      saveResult({
        roundId: ticket.roundId,
        results: data.results || [],
        matches: data.matches || [],
        settled,
        summary: money(totalWon),
        balance: data.balance,
      });
      router.push("/virtual/play");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  if (!ticket) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-surface text-sm text-ink-muted">
        Loading ticket…
      </div>
    );
  }

  const id = ticketNumber(ticket.betId, ticket.roundId + ticket.placedAt);

  return (
    <div className="fixed inset-0 z-[60] bg-bg text-ink">
      <div className="mx-auto flex h-full max-w-lg flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-2.5 bg-surface px-3 py-2.5 shadow-card">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/virtual")}
            className="text-2xl leading-none text-ink"
          >
            ←
          </button>
          <h1 className="flex-1 text-[15px] font-light text-ink-muted">
            Instant Virtuals
          </h1>
          <span
            className="relative rounded-full border px-3 py-1.5 text-[12px] tabular-nums"
            style={{ borderColor: PURPLE, color: PURPLE }}
          >
            {balance == null ? "…" : balanceText(balance)}
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        </header>

        {/* Open Bets bar */}
        <div className="flex shrink-0 items-center gap-2 bg-surface px-3 py-2">
          <span className="text-[13px] text-ink-muted">Open Bets</span>
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-semibold text-white"
            style={{ background: PURPLE }}
          >
            1
          </span>
        </div>

        {/* Ticket */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3">
          <div className="rounded-2xl px-3.5 pt-3 pb-4" style={{ background: "var(--color-surface-raised)" }}>
            <div className="flex items-baseline justify-between border-b border-ink-muted/20 pb-3">
              <span className="text-[14px] text-ink">
                {ticket.legs.length > 1 ? "Multiple" : "Single"}
              </span>
              <span className="text-[12px] text-ink-muted">
                Ticket ID{" "}
                <span className="text-[13px] text-ink">{id}</span>
              </span>
            </div>

            {open &&
              ticket.legs.map((l) => (
                <div
                  key={`${l.matchId}-${l.market}-${l.pick}`}
                  className="border-b border-ink-muted/20 py-2.5 text-[13px] leading-8 text-ink"
                >
                  <div>
                    {l.label} @{l.odds.toFixed(2)}
                  </div>
                  <div>{MARKET_TITLE[l.market]}</div>
                  <div>
                    {teamCode(l.home)} vs {teamCode(l.away)}
                  </div>
                </div>
              ))}

            <div className="flex justify-end py-2">
              <button
                type="button"
                aria-label={open ? "Collapse" : "Expand"}
                onClick={() => setOpen((v) => !v)}
                className="px-2 text-[11px]"
                style={{ color: PURPLE }}
              >
                {open ? "▲" : "▼"}
              </button>
            </div>

            <div className="flex items-end justify-between text-ink-muted">
              <span className="text-[12px]">
                Stake{" "}
                <span className="ml-1 text-[15px] text-ink tabular-nums">
                  {money(ticket.stake)}
                </span>
              </span>
              <span className="text-[12px]">
                Pot. Win{" "}
                <span className="ml-1 text-[15px] text-ink tabular-nums">
                  {money(ticket.potential)}
                </span>
              </span>
            </div>
          </div>

          {err && (
            <p className="mt-3 text-center text-xs font-medium text-red-600">
              {err}
            </p>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex h-12 shrink-0 text-[14px]">
          <button
            type="button"
            onClick={() => router.push("/virtual")}
            className="flex flex-[1.1] items-center justify-center bg-ink-muted/15 text-ink-muted"
          >
            Keep Betting
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void kickOff()}
            className="flex flex-1 items-center justify-center text-white disabled:opacity-60"
            style={{ background: PURPLE }}
          >
            {busy ? "Starting…" : "Kick Off"}
          </button>
        </div>
      </div>
    </div>
  );
}
