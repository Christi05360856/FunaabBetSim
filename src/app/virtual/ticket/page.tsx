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

const PURPLE = "#51489b";

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
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white text-sm text-neutral-500">
        Loading ticket…
      </div>
    );
  }

  const id = ticketNumber(ticket.betId, ticket.roundId + ticket.placedAt);

  return (
    <div className="fixed inset-0 z-[60] bg-[#fafafa] text-neutral-800">
      <div className="mx-auto flex h-full max-w-lg flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-4 bg-white px-4 py-4 shadow-sm">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/virtual")}
            className="text-2xl leading-none text-neutral-700"
          >
            ←
          </button>
          <h1 className="flex-1 text-[22px] font-light text-neutral-600">
            Instant Virtuals
          </h1>
          <span
            className="relative rounded-full border px-4 py-1.5 text-[16px] tabular-nums"
            style={{ borderColor: PURPLE, color: PURPLE }}
          >
            {balance == null ? "…" : balanceText(balance)}
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        </header>

        {/* Open Bets bar */}
        <div className="flex shrink-0 items-center gap-2 bg-white px-4 py-3">
          <span className="text-[19px] text-neutral-600">Open Bets</span>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-semibold text-white"
            style={{ background: PURPLE }}
          >
            1
          </span>
        </div>

        {/* Ticket */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3">
          <div className="rounded-2xl px-5 pt-5 pb-4" style={{ background: "#d9d6e8" }}>
            <div className="flex items-baseline justify-between border-b border-neutral-400/40 pb-3">
              <span className="text-[20px] text-neutral-700">
                {ticket.legs.length > 1 ? "Multiple" : "Single"}
              </span>
              <span className="text-[15px] text-neutral-500">
                Ticket ID{" "}
                <span className="text-[19px] text-neutral-700">{id}</span>
              </span>
            </div>

            {open &&
              ticket.legs.map((l) => (
                <div
                  key={`${l.matchId}-${l.market}-${l.pick}`}
                  className="border-b border-neutral-400/40 py-4 text-[19px] leading-8 text-neutral-700"
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

            <div className="flex justify-end py-3">
              <button
                type="button"
                aria-label={open ? "Collapse" : "Expand"}
                onClick={() => setOpen((v) => !v)}
                className="px-2 text-[14px]"
                style={{ color: PURPLE }}
              >
                {open ? "▲" : "▼"}
              </button>
            </div>

            <div className="flex items-end justify-between text-neutral-500">
              <span className="text-[16px]">
                Stake{" "}
                <span className="ml-1 text-[22px] text-neutral-700 tabular-nums">
                  {money(ticket.stake)}
                </span>
              </span>
              <span className="text-[16px]">
                Pot. Win{" "}
                <span className="ml-1 text-[22px] text-neutral-700 tabular-nums">
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
        <div className="flex h-14 shrink-0 text-[20px]">
          <button
            type="button"
            onClick={() => router.push("/virtual")}
            className="flex flex-[1.1] items-center justify-center bg-[#d7d7d7] text-neutral-600"
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
