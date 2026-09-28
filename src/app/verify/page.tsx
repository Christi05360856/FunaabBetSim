"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, resolveSelection } from "@/lib/domain/selectionLabel";

type VerifyLeg = {
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel?: string;
  odds: number;
  status?: string;
};

type VerifyBet = {
  id: string;
  status: string;
  stake: number;
  potentialPayout: number;
  payout: number | null;
  placedAt: number;
  settledAt: number | null;
  legs: VerifyLeg[];
};

type MatchInfo = {
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
};

type TeamInfo = { name?: string };

export default function VerifyTicketPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bet, setBet] = useState<VerifyBet | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchInfo>>({});
  const [teams, setTeams] = useState<Record<string, TeamInfo>>({});

  async function verify() {
    const id = input.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setBet(null);
    try {
      const res = await fetch(
        "/api/bets/verify?id=" + encodeURIComponent(id)
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not verify");
      setBet(body.bet as VerifyBet);
      setMatches((body.matches ?? {}) as Record<string, MatchInfo>);
      setTeams((body.teams ?? {}) as Record<string, TeamInfo>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-bg bg-bg px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-emerald-700" aria-label="Back">
          ←
        </Link>
        <h1 className="text-lg font-bold text-ink">Verify ticket</h1>
      </div>

      <p className="mb-3 text-sm text-ink-muted">
        Enter a ticket ID to view stake, odds, and result. Tickets older than 6
        months cannot be verified.
      </p>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ticket ID"
          className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 bg-surface px-3 py-3 font-mono text-sm uppercase"
          onKeyDown={(e) => {
            if (e.key === "Enter") void verify();
          }}
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void verify()}
          className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {loading ? "…" : "Verify"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      {bet && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-ink-muted/15 bg-surface shadow-sm">
          <div
            className={
              "px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-white " +
              (bet.status === "won"
                ? "bg-emerald-600"
                : bet.status === "lost"
                  ? "bg-rose-600"
                  : bet.status === "open"
                    ? "bg-amber-500"
                    : "bg-bg0")
            }
          >
            {bet.status === "won" ? "PAID OUT" : bet.status}
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-ink-muted/10 p-4 text-sm">
            <div>
              <p className="text-[11px] text-ink-muted">Ticket ID</p>
              <p className="break-all font-mono text-xs font-semibold">
                {bet.id}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-muted">Placed</p>
              <p className="font-medium">
                {new Date(bet.placedAt).toLocaleString("en-NG")}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-muted">Stake</p>
              <p className="font-semibold">{formatMoney(bet.stake)}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-muted">
                {bet.status === "won" ? "Paid out" : "Potential return"}
              </p>
              <p className="font-semibold text-emerald-700">
                {formatMoney(
                  bet.status === "won" && bet.payout != null
                    ? bet.payout
                    : bet.potentialPayout
                )}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-ink-muted/10">
            {bet.legs.map((leg, i) => {
              const m = matches[leg.matchId];
              const h = m?.homeTeamId
                ? teams[m.homeTeamId]?.name ?? "Home"
                : "Home";
              const a = m?.awayTeamId
                ? teams[m.awayTeamId]?.name ?? "Away"
                : "Away";
              const sel = resolveSelection(
                leg.selectionId,
                leg.selectionLabel
              );
              const score =
                m?.homeScore != null && m?.awayScore != null
                  ? m.homeScore + " – " + m.awayScore
                  : null;
              return (
                <li key={leg.matchId + "-" + i} className="px-4 py-3">
                  <p className="text-sm font-bold">
                    {h} vs {a}
                  </p>
                  {score && (
                    <p className="text-xs text-ink-muted">FT {score}</p>
                  )}
                  <p className="mt-1 text-xs text-ink-muted">
                    {sel.market} · {sel.pick} @ {Number(leg.odds).toFixed(2)}
                    {leg.status ? " · " + leg.status : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
