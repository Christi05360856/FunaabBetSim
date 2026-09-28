"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { useBetSlip, type SlipItem } from "@/lib/context/BetSlipContext";
import { MINIMUM_STAKE } from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";

export function BetSlip() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const {
    items,
    removeItem,
    clearSlip,
    loadLegs,
    totalOdds,
    isOpen,
    setIsOpen,
  } = useBetSlip();

  const [stake, setStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bookingCode, setBookingCode] = useState<string | null>(null);
  const [loadCodeInput, setLoadCodeInput] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);

  if (pathname?.startsWith("/admin")) return null;

  const stakeNum = Number(stake) || 0;
  const balance = wallet?.balance ?? 0;
  const potential = Math.round(stakeNum * totalOdds);
  const overBalance = stake !== "" && stakeNum > balance;
  const stakeValid =
    stake !== "" &&
    stakeNum >= MINIMUM_STAKE &&
    !overBalance &&
    items.length > 0;
  const modeLabel = items.length <= 1 ? "Single" : "Multiple";

  async function placeBet() {
    if (!user || !stakeValid) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const legs = items.map((i) => ({
        matchId: i.matchId,
        marketId: i.marketId,
        selectionId: i.selectionId,
        selectionLabel: i.selectionLabel,
        odds: i.odds,
      }));
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ legs, stake: stakeNum }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not place bet");
      setFeedback(
        "Bet placed! Potential: " +
          formatMoney(body.potentialPayout ?? potential)
      );
      clearSlip();
      setStake("");
      setBookingCode(null);
      setIsOpen(false);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function bookCode() {
    setFeedback(null);
    setBookingCode(null);
    try {
      const legs = items.map((i) => ({
        matchId: i.matchId,
        marketId: i.marketId,
        selectionId: i.selectionId,
        selectionLabel: i.selectionLabel,
        odds: i.odds,
      }));
      const res = await fetch("/api/bets/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not book");
      setBookingCode(body.code as string);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Booking failed");
    }
  }

  async function loadBookingCode() {
    const code = loadCodeInput.trim().toUpperCase();
    if (!code) return;
    setLoadingCode(true);
    setFeedback(null);
    try {
      const res = await fetch(
        "/api/bets/book?code=" + encodeURIComponent(code)
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Code not found");
      const legs = (body.booking?.legs ?? []) as Array<{
        matchId: string;
        marketId: string;
        selectionId: string;
        selectionLabel: string;
        odds: number;
        homeTeamName?: string;
        awayTeamName?: string;
        marketName?: string;
      }>;
      if (legs.length === 0) throw new Error("Code has no selections");
      const mapped: SlipItem[] = legs.map((l) => ({
        matchId: l.matchId,
        marketId: l.marketId,
        selectionId: l.selectionId,
        selectionLabel: l.selectionLabel,
        odds: l.odds,
        homeTeamName: l.homeTeamName ?? "Home",
        awayTeamName: l.awayTeamName ?? "Away",
        marketName: l.marketName ?? "Market",
      }));
      loadLegs(mapped);
      setLoadCodeInput("");
      setFeedback("Loaded " + mapped.length + " pick(s)");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not load code");
    } finally {
      setLoadingCode(false);
    }
  }

  // ——— Collapsed floating badge (SportyBet green orb) ———
  if (!isOpen) {
    return (
      <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
        {/* Always show a small ticket icon so empty slip can load a code */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
          aria-label="Open bet slip"
        >
          <TicketIcon />
          {items.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-surface px-1 text-[11px] font-bold text-emerald-700">
              {items.length}
            </span>
          )}
        </button>
        {items.length > 0 && (
          <span className="pointer-events-none rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-bold text-white shadow">
            {totalOdds.toFixed(2)}
          </span>
        )}
      </div>
    );
  }

  // ——— Expanded sheet ———
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Dim backdrop — tap to close, fixtures stay usable after close */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close bet slip"
        onClick={() => setIsOpen(false)}
      />

      <div className="relative flex max-h-[85vh] flex-col rounded-t-2xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-muted/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {items.length}
            </span>
            <div>
              <p className="text-sm font-bold text-ink">Bet slip</p>
              <p className="text-[11px] text-ink-muted">
                {items.length === 0
                  ? "Empty — load a code or pick odds"
                  : modeLabel + " · odds " + totalOdds.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearSlip();
                  setStake("");
                  setBookingCode(null);
                }}
                className="text-xs font-medium text-rose-600"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-ink-muted/10 px-2.5 py-1 text-sm text-ink-muted"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-ink-muted/10 text-sm font-semibold">
          <div
            className={
              "flex-1 py-2.5 text-center " +
              (items.length <= 1
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-ink-muted")
            }
          >
            Single
          </div>
          <div
            className={
              "flex-1 py-2.5 text-center " +
              (items.length > 1
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-ink-muted")
            }
          >
            Multiple
          </div>
        </div>

        {/* Legs list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {items.length === 0 ? (
            <div className="space-y-4 py-4">
              <p className="text-center text-sm text-ink-muted">
                Tap odds on fixtures to add picks
              </p>
              <div className="rounded-xl border border-ink-muted/15 p-3">
                <p className="mb-2 text-xs font-semibold text-ink">
                  Load booking code
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={loadCodeInput}
                    onChange={(e) =>
                      setLoadCodeInput(e.target.value.toUpperCase())
                    }
                    placeholder="FB-XXXX"
                    className="min-w-0 flex-1 rounded-lg border border-ink-muted/15 px-3 py-2 text-sm uppercase tracking-wider"
                  />
                  <button
                    type="button"
                    disabled={loadingCode || !loadCodeInput.trim()}
                    onClick={loadBookingCode}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {loadingCode ? "…" : "Load"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.matchId + item.selectionId}
                  className="flex items-start gap-2 rounded-xl border border-ink-muted/10 bg-bg px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-ink-muted">
                      {item.marketName}
                    </p>
                    <p className="truncate text-sm font-semibold text-ink">
                      {item.homeTeamName} vs {item.awayTeamName}
                    </p>
                    <p className="mt-0.5 text-sm">
                      <span className="font-medium text-emerald-700">
                        {item.selectionLabel}
                      </span>
                      <span className="text-ink-muted"> @ </span>
                      <span className="font-bold tabular-nums">
                        {item.odds.toFixed(2)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.matchId)}
                    className="shrink-0 pt-0.5 text-ink-muted hover:text-rose-600"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer: stake + actions */}
        {items.length > 0 && (
          <div className="border-t border-ink-muted/10 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {user && (
              <p className="mb-2 text-[11px] text-ink-muted">
                Balance{" "}
                <span className="font-semibold text-ink">
                  {formatMoney(balance)}
                </span>
              </p>
            )}

            {!user ? (
              <p className="py-2 text-center text-sm text-ink-muted">
                <a href="/login" className="font-semibold text-emerald-600">
                  Log in
                </a>{" "}
                to place a bet
              </p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {[1000, 5000, 20000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        const next = (Number(stake) || 0) + amt;
                        setStake(String(Math.min(next, balance)));
                      }}
                      className="rounded-lg bg-ink-muted/10 px-2.5 py-1 text-xs font-semibold text-ink"
                    >
                      +₦{amt.toLocaleString("en-NG")}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink-muted">Total odds</span>
                  <span className="font-bold tabular-nums">
                    {totalOdds.toFixed(2)}
                  </span>
                </div>
                {stakeValid && (
                  <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-muted">Potential win</span>
                    <span className="font-bold tabular-nums text-emerald-600">
                      {formatMoney(potential)}
                    </span>
                  </div>
                )}

                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={"Stake min ₦" + MINIMUM_STAKE.toLocaleString("en-NG")}
                    value={stake}
                    onChange={(e) =>
                      setStake(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 px-3 py-2.5 text-sm"
                  />
                </div>
                {overBalance && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    Balance not enough
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={bookCode}
                    className="rounded-xl border-2 border-emerald-600 py-3 text-sm font-bold text-emerald-700"
                  >
                    Book bet
                  </button>
                  <button
                    type="button"
                    disabled={!stakeValid || submitting}
                    onClick={placeBet}
                    className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {submitting ? "…" : "Place bet"}
                  </button>
                </div>

                {bookingCode && (
                  <div className="mt-3 rounded-xl bg-bg p-3 text-center">
                    <p className="text-[11px] text-ink-muted">Booking code</p>
                    <p className="font-mono text-lg font-bold tracking-widest text-ink">
                      {bookingCode}
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-emerald-700"
                      onClick={() =>
                        void navigator.clipboard?.writeText(bookingCode)
                      }
                    >
                      Copy
                    </button>
                  </div>
                )}
              </>
            )}

            {feedback && (
              <p className="mt-2 text-center text-xs text-ink">{feedback}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 010 4v2a2 2 0 002 2h12a2 2 0 002-2v-2a2 2 0 010-4zM8 13H6v-2h2v2zm0-4H6V7h2v2zm4 4h-2v-2h2v2zm0-4h-2V7h2v2zm4 4h-2v-2h2v2zm0-4h-2V7h2v2z" />
    </svg>
  );
                          }
