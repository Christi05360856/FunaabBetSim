"use client";

/**
 * Open ticket — Keep Betting | Kick Off (Sporty-style).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  clearTicket,
  loadTicket,
  saveResult,
  type StoredTicket,
} from "@/lib/virtual/ticketStore";
import { unlockAudio } from "@/lib/casino/sounds";

function chips(n: number) {
  return n.toLocaleString("en-NG");
}

export default function VirtualTicketPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [ticket, setTicket] = useState<StoredTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = loadTicket();
    if (!t) {
      router.replace("/virtual");
      return;
    }
    setTicket(t);
  }, [router]);

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
      const profit = settled.reduce((a, s) => a + (s.profit || 0), 0);
      const won = settled.some((s) => s.status === "won");
      const summary =
        settled.length === 0
          ? "No open bets"
          : won
            ? `Won · +${chips(Math.max(0, profit))}`
            : `Lost · ${chips(profit)}`;

      saveResult({
        roundId: ticket.roundId,
        results: data.results || [],
        matches: data.matches || [],
        settled,
        summary,
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
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-ink-muted">
        Loading ticket…
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg pb-36 text-ink">
      <header className="bg-brand px-3 py-3 text-white">
        <div className="flex items-center justify-between">
          <Link href="/virtual" className="text-sm font-semibold">
            ← Instant Football
          </Link>
          <span className="text-xs font-bold">Open bets · 1</span>
        </div>
      </header>

      <div className="mx-3 mt-4 rounded-2xl border border-ink-muted/15 bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Multiple</p>
          <p className="text-[10px] text-ink-muted">Round {ticket.roundId}</p>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {ticket.legs.map((l) => (
            <div
              key={`${l.matchId}-${l.market}-${l.pick}`}
              className="border-b border-ink-muted/10 pb-3 last:border-0 last:pb-0"
            >
              <p className="text-sm font-semibold">
                {l.label} @{l.odds.toFixed(2)}
              </p>
              <p className="text-[11px] text-ink-muted">
                {l.market.toUpperCase()} · {l.home} vs {l.away}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-ink-muted">
            Stake {chips(ticket.stake)}
          </span>
          <span className="font-bold text-brand">
            Pot. win {chips(ticket.potential)}
          </span>
        </div>
      </div>

      {err && (
        <p className="mx-3 mt-3 text-center text-xs text-red-600">{err}</p>
      )}

      <div
        className="fixed inset-x-0 z-40 border-t border-ink-muted/15 bg-surface px-2 pt-2"
        style={{
          bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            type="button"
            onClick={() => router.push("/virtual")}
            className="flex-1 rounded-xl border border-ink-muted/25 py-3.5 text-sm font-bold"
          >
            Keep betting
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void kickOff()}
            className="flex-1 rounded-xl bg-brand py-3.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Starting…" : "Kick Off"}
          </button>
        </div>
      </div>
    </main>
  );
}
