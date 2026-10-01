"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/hooks/useWallet";
import { useBetSlip } from "@/lib/context/BetSlipContext";
import {
  MINIMUM_STAKE,
  PROMO_MIN_LEG_ODDS,
  PROMO_REQUIRED_LEGS,
} from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";
import { isValidPromoTicket } from "@/lib/domain/wallet";

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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
  const [codeCopied, setCodeCopied] = useState(false);
  const [loadCodeInput, setLoadCodeInput] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  /** cash = normal; promo = spend promo points only */
  const [fundMode, setFundMode] = useState<"cash" | "promo">("cash");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Stale code when selection count changes
  useEffect(() => {
    setBookingCode(null);
    setCodeCopied(false);
  }, [items.length, totalOdds]);

  if (pathname?.startsWith("/admin")) return null;

  const stakeNum = Number(stake) || 0;
  const purchased = Math.max(0, wallet?.purchased ?? 0);
  const promo = Math.max(0, wallet?.promo ?? 0);
  const balance = Math.max(
    0,
    wallet?.balance ?? purchased + promo
  );
  const potential = Math.round(stakeNum * totalOdds);

  const promoRules = wallet?.promoBetRules ?? null;
  const promoEligible = isValidPromoTicket(items, undefined, promoRules);
  const promoCanCover =
    promoEligible && promo >= stakeNum && stakeNum >= MINIMUM_STAKE;

  // Clear stale success text when selections change
  useEffect(() => {
    setFeedback(null);
    setBookingCode(null);
    if (!promoEligible && fundMode === "promo") setFundMode("cash");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, totalOdds]);

  const activeBalance = fundMode === "promo" ? promo : balance;
  const overBalance = stake !== "" && stakeNum > activeBalance;
  const stakeValid =
    stake !== "" &&
    stakeNum >= MINIMUM_STAKE &&
    !overBalance &&
    items.length > 0 &&
    (fundMode === "cash" || promoCanCover);
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
        body: JSON.stringify({
          legs,
          stake: stakeNum,
          funding: fundMode === "promo" ? "promo" : "auto",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not place bet");
      setFeedback(
        (fundMode === "promo" ? "Promo bet placed! " : "Bet placed! ") +
          "Potential: " +
          formatMoney(body.potentialPayout ?? potential)
      );
      clearSlip();
      setStake("");
      setBookingCode(null);
      setFundMode("cash");
      setIsOpen(false);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function bookCode(forceNew = false) {
    if (!user || items.length === 0) return;
    // Re-open existing code instead of minting a new one on every tap
    if (bookingCode && !forceNew) {
      setCodeCopied(false);
      return;
    }
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
      const res = await fetch("/api/bets/book", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ legs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not book");
      setBookingCode(body.code as string);
      setCodeCopied(false);
      setFeedback(null);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Book failed");
    } finally {
      setSubmitting(false);
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
      const legs = (body.booking?.legs ?? []) as {
        matchId: string;
        marketId: string;
        selectionId: string;
        selectionLabel: string;
        odds: number;
      }[];
      if (!legs.length) throw new Error("Empty booking");
      loadLegs(
        legs.map((l) => ({
          ...l,
          homeTeamName: (l as { homeTeamName?: string }).homeTeamName ?? "Home",
          awayTeamName: (l as { awayTeamName?: string }).awayTeamName ?? "Away",
          marketName: (l as { marketName?: string }).marketName ?? "1X2",
        }))
      );
      setLoadCodeInput("");
      setFeedback("Code loaded");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not load code");
    } finally {
      setLoadingCode(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
      {/* FAB */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto mb-[calc(4.25rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg"
          aria-label="Open bet slip"
        >
          <span className="relative">
            <TicketIcon />
            {items.length > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-emerald-700">
                {items.length}
              </span>
            )}
          </span>
        </button>
      )}

      {/* Sheet */}
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-2xl bg-surface shadow-2xl transition-transform duration-200 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-muted/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {items.length}
            </span>
            <div>
              <p className="text-sm font-bold">Bet slip</p>
              <p className="text-[11px] text-ink-muted">
                {items.length === 0
                  ? "Empty — load a code or pick odds"
                  : `${modeLabel} · odds ${totalOdds.toFixed(2)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => clearSlip()}
                className="text-xs font-semibold text-rose-600"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-lg text-ink-muted"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[40vh] overflow-y-auto px-4 py-2">
          {items.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-muted">
              <p className="mb-3">Tap odds on fixtures to add picks</p>
              <div className="mx-auto flex max-w-xs gap-2">
                <input
                  value={loadCodeInput}
                  onChange={(e) => setLoadCodeInput(e.target.value)}
                  placeholder="FB-XXXXXXXX"
                  className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={loadingCode}
                  onClick={() => void loadBookingCode()}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Load
                </button>
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

        {items.length > 0 && (
          <div className="border-t border-ink-muted/10 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {/* Funding tabs — Bet | Promo (Paripesa-style) */}
            {user && (
              <div className="mb-3 flex rounded-xl bg-ink-muted/10 p-1">
                <button
                  type="button"
                  onClick={() => setFundMode("cash")}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold ${
                    fundMode === "cash"
                      ? "bg-surface text-ink shadow-sm"
                      : "text-ink-muted"
                  }`}
                >
                  Bet
                </button>
                <button
                  type="button"
                  disabled={!promoEligible || promo < MINIMUM_STAKE}
                  onClick={() => setFundMode("promo")}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold disabled:opacity-40 ${
                    fundMode === "promo"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-ink-muted"
                  }`}
                >
                  Promo ({promo.toLocaleString("en-NG")})
                </button>
              </div>
            )}

            {user && fundMode === "promo" && (
              <p className="mb-2 text-[11px] leading-snug text-ink-muted">
                Using promo points
                {promoRules?.terms
                  ? `: ${promoRules.terms}`
                  : promoRules == null
                    ? " (default: 5×1X2 ≥2.00)"
                    : " (open rules)"}
                .{" "}
                <Link href="/promo" className="text-emerald-700 underline">
                  Rules
                </Link>
              </p>
            )}

            {user && !promoEligible && items.length > 0 && fundMode === "promo" && (
              <p className="mb-2 text-[11px] text-ink-muted">
                {promoRules?.terms ||
                  "Current picks do not meet promo betting rules."}
              </p>
            )}

            {user && (
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                <span>
                  Cash{" "}
                  <span className="font-semibold text-ink">
                    {formatMoney(purchased)}
                  </span>
                </span>
                <span>
                  Promo{" "}
                  <span className="font-semibold text-emerald-700">
                    {formatMoney(promo)}
                  </span>
                </span>
                <span>
                  Available{" "}
                  <span className="font-semibold text-ink">
                    {formatMoney(activeBalance)}
                  </span>
                </span>
              </div>
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
                  {[100, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        const next = (Number(stake) || 0) + amt;
                        setStake(String(Math.min(next, activeBalance)));
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
                    placeholder={
                      "Stake min ₦" + MINIMUM_STAKE.toLocaleString("en-NG")
                    }
                    value={stake}
                    onChange={(e) =>
                      setStake(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 px-3 py-2.5 text-sm"
                  />
                </div>
                {overBalance && (
                  <p className="mt-1 text-xs font-medium text-rose-600">
                    {fundMode === "promo"
                      ? "Not enough promo points"
                      : "Balance not enough"}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void bookCode()}
                    className="rounded-xl border-2 border-emerald-600 py-3 text-sm font-bold text-emerald-700"
                  >
                    Book bet
                  </button>
                  <button
                    type="button"
                    disabled={!stakeValid || submitting}
                    onClick={() => void placeBet()}
                    className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {submitting
                      ? "…"
                      : fundMode === "promo"
                        ? "Place promo bet"
                        : "Place bet"}
                  </button>
                </div>

                {bookingCode && (
                  <button
                    type="button"
                    onClick={() => setCodeCopied(false)}
                    className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      Booking code ready — tap to share
                    </p>
                    <p className="font-mono text-base font-bold tracking-widest text-ink">
                      {bookingCode}
                    </p>
                  </button>
                )}
              </>
            )}

            {feedback && (
              <p
                className={`mt-2 text-center text-xs ${
                  feedback.toLowerCase().includes("placed")
                    ? "text-emerald-700"
                    : "text-ink"
                }`}
              >
                {feedback}
              </p>
            )}
          </div>
        )}
      </div>


      {mounted &&
        bookingCode &&
        createPortal(
          <div
            className="pointer-events-auto fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-code-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close booking code"
              onClick={() => {
                setBookingCode(null);
                setCodeCopied(false);
              }}
            />
            <div className="relative z-[201] w-full max-w-md rounded-t-3xl bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-xl sm:rounded-3xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-muted/25 sm:hidden" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p id="booking-code-title" className="text-sm font-bold text-ink">
                    Booking code
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Share this code so a friend can load the same picks
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-muted/10 text-xl leading-none text-ink"
                  aria-label="Close"
                  onClick={() => {
                    setBookingCode(null);
                    setCodeCopied(false);
                  }}
                >
                  ×
                </button>
              </div>

              <div className="mt-4 select-all rounded-2xl border border-ink-muted/10 bg-bg px-4 py-5 text-center">
                <p className="font-mono text-2xl font-extrabold tracking-[0.15em] text-ink sm:text-3xl">
                  {bookingCode}
                </p>
                <p className="mt-2 text-[11px] text-ink-muted">
                  {items.length} selection{items.length === 1 ? "" : "s"} · odds{" "}
                  {totalOdds.toFixed(2)}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white active:opacity-90"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const ok = await copyText(bookingCode);
                    setCodeCopied(ok);
                    if (!ok) {
                      setFeedback("Long-press the code to copy");
                    }
                  }}
                >
                  {codeCopied ? "Copied ✓" : "Copy code"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border-2 border-emerald-600 py-3 text-sm font-bold text-emerald-700 active:opacity-90"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const text =
                      "FUNAAB BetSim booking code: " +
                      bookingCode +
                      " — open Bet slip → Load code to get my picks.";
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: "FUNAAB BetSim",
                          text,
                        });
                      } else {
                        const ok = await copyText(text);
                        setCodeCopied(ok);
                        setFeedback(ok ? "Share text copied" : "Could not share");
                      }
                    } catch {
                      /* cancelled */
                    }
                  }}
                >
                  Share
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-emerald-700">
                <a
                  className="underline"
                  href={
                    "https://wa.me/?text=" +
                    encodeURIComponent(
                      "FUNAAB BetSim code " +
                        bookingCode +
                        " — open Bet slip → Load code"
                    )
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  WhatsApp
                </a>
                <a
                  className="underline"
                  href={
                    "https://t.me/share/url?url=" +
                    encodeURIComponent("https://funaab-betsim.vercel.app") +
                    "&text=" +
                    encodeURIComponent("Booking code: " + bookingCode)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Telegram
                </a>
                <button
                  type="button"
                  className="text-ink-muted underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void bookCode(true);
                  }}
                >
                  New code
                </button>
              </div>

              <p className="mt-4 text-center text-[10px] text-ink-muted">
                Codes stop working after matches finish
              </p>
            </div>
          </div>,
          document.body
        )}
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
