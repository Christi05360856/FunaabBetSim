"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { useBetSlip } from "@/lib/context/BetSlipContext";
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
    totalOdds,
    isOpen,
    setIsOpen,
  } = useBetSlip();

  const [stake, setStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bookingCode, setBookingCode] = useState<string | null>(null);

  if (pathname?.startsWith("/admin")) return null;
  if (items.length === 0 && !isOpen) return null;

  const stakeNum = Number(stake) || 0;
  const balance = wallet?.balance ?? 0;
  const potential = Math.round(stakeNum * totalOdds);
  const overBalance = stake !== "" && stakeNum > balance;
  const stakeValid =
    stake !== "" && stakeNum >= MINIMUM_STAKE && !overBalance && items.length > 0;

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
        "Bet placed! Potential: " + formatMoney(body.potentialPayout ?? potential)
      );
      clearSlip();
      setStake("");
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

  // Collapsed bar when closed but has items
  if (!isOpen && items.length > 0) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
      >
        Bet slip · {items.length}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
          {totalOdds.toFixed(2)}
        </span>
      </button>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-sm font-bold">
            Bet slip · {items.length} {items.length === 1 ? "pick" : "picks"}
          </p>
          <p className="text-xs text-gray-500">
            {items.length > 1 ? "Accumulator" : "Single"} · odds{" "}
            {totalOdds.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearSlip}
              className="text-xs font-medium text-rose-600"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-600"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Tap odds on fixtures to add picks
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.matchId}
                className="flex items-start gap-2 rounded-xl bg-gray-50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-gray-500">
                    {item.marketName}
                  </p>
                  <p className="truncate text-sm font-semibold">
                    {item.homeTeamName} vs {item.awayTeamName}
                  </p>
                  <p className="mt-0.5 text-sm">
                    <span className="font-medium text-emerald-700">
                      {item.selectionLabel}
                    </span>
                    <span className="text-gray-500"> @ </span>
                    <span className="font-bold">{item.odds.toFixed(2)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.matchId)}
                  className="shrink-0 text-gray-400 hover:text-rose-600"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {!user ? (
            <p className="text-center text-sm text-gray-600">
              <a href="/login" className="font-semibold text-emerald-600">
                Log in
              </a>{" "}
              to place a bet
            </p>
          ) : (
            <>
              <div className="mb-2 flex gap-2">
                {[1000, 5000, 20000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      const next = (Number(stake) || 0) + amt;
                      setStake(String(Math.min(next, balance)));
                    }}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700"
                  >
                    +₦{amt.toLocaleString("en-NG")}
                  </button>
                ))}
                {stake && (
                  <button
                    type="button"
                    onClick={() => setStake("")}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs text-gray-500"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={"Min ₦" + MINIMUM_STAKE.toLocaleString("en-NG")}
                  value={stake}
                  onChange={(e) =>
                    setStake(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  disabled={!stakeValid || submitting}
                  onClick={placeBet}
                  className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "…" : "Place bet"}
                </button>
              </div>
              {overBalance && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  Balance not enough
                </p>
              )}
              {stakeValid && (
                <p className="mt-1 text-xs text-gray-500">
                  Potential return{" "}
                  <span className="font-semibold text-emerald-600">
                    {formatMoney(potential)}
                  </span>
                </p>
              )}
              <button
                type="button"
                onClick={bookCode}
                className="mt-2 w-full text-center text-xs font-medium text-emerald-700"
              >
                Get booking code
              </button>
              {bookingCode && (
                <p className="mt-1 text-center text-sm font-bold tracking-wider text-gray-800">
                  {bookingCode}
                </p>
              )}
            </>
          )}
          {feedback && (
            <p className="mt-2 text-center text-xs text-gray-700">{feedback}</p>
          )}
        </div>
      )}
    </div>
  );
}
