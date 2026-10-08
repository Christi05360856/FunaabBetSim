"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Bet, Match, Team } from "@/types/domain";
import {
  formatMoney,
  formatMoneyFull,
  resolveSelection,
} from "@/lib/domain/selectionLabel";
import { useSheetHistory } from "@/lib/hooks/useSheetHistory";
import { useBetSlip } from "@/lib/context/BetSlipContext";
import { shareOfficialTicket } from "@/components/bets/TicketShareCard";
import {
  betLegs,
  displayOdds,
  legResult,
  legsToSlipItems,
  matchLabel,
  settledReturn,
  settlementTimeline,
  statusStyle,
} from "./myBetsUtils";

export function BetTicketDetail({
  bet,
  matches,
  teams,
  onClose,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { loadLegs } = useBetSlip();
  const legs = betLegs(bet);
  const odds = displayOdds(bet);
  const ret = settledReturn(bet);
  const isAcca = legs.length > 1;
  const { requestClose } = useSheetHistory(true, onClose);
  const [shareBusy, setShareBusy] = useState(false);
  const timeline = settlementTimeline(bet, matches);

  function onBetAgain() {
    const items = legsToSlipItems(bet, matches, teams);
    if (items.length === 0) return;
    loadLegs(items);
    requestClose();
    router.push("/fixtures");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-x-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-3 bg-emerald-600 px-3 py-3 text-white">
        <button
          type="button"
          onClick={requestClose}
          className="rounded-full p-1 text-xl leading-none"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="flex-1 text-base font-bold">Ticket</h2>
        <button
          type="button"
          disabled={shareBusy}
          onClick={() => {
            void (async () => {
              setShareBusy(true);
              try {
                await shareOfficialTicket(bet, matches, teams);
              } finally {
                setShareBusy(false);
              }
            })();
          }}
          className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"
        >
          {shareBusy ? "…" : "Share"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-32 pt-3">
        {/* Meta */}
        <section className="rounded-2xl border border-ink-muted/12 bg-surface p-4">
          <div className="flex items-start justify-between gap-2 text-[11px] text-ink-muted">
            <span className="min-w-0 truncate font-mono">
              {bet.id.slice(0, 12).toUpperCase()}
            </span>
            <span className="shrink-0">
              {new Date(bet.placedAt).toLocaleString("en-NG", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink">
              {isAcca ? "Multiple · " + legs.length + " legs" : "Single"}
            </p>
            <span
              className={
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase " +
                statusStyle(bet.status)
              }
            >
              {bet.status}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-muted/10 pt-3">
            <div>
              <p className="text-[9px] font-semibold uppercase text-ink-muted">
                Stake
              </p>
              <p
                className="text-sm font-bold tabular-nums"
                title={formatMoneyFull(bet.stake)}
              >
                {formatMoney(bet.stake)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-semibold uppercase text-ink-muted">
                Odds
              </p>
              <p className="text-sm font-bold tabular-nums">{odds.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase text-ink-muted">
                {bet.status === "won" ? "Return" : "Pot. win"}
              </p>
              <p
                className={
                  "text-sm font-bold tabular-nums " +
                  (bet.status === "won" ? "text-emerald-600" : "")
                }
                title={formatMoneyFull(ret)}
              >
                {bet.status === "won" ? "+" : ""}
                {formatMoney(ret)}
              </p>
            </div>
          </div>
        </section>

        {/* Settlement timeline */}
        <section className="mt-4 rounded-2xl border border-ink-muted/12 bg-surface p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            Progress
          </p>
          <ol className="mt-3 flex items-start justify-between gap-1">
            {timeline.map((step, i) => (
              <li key={step.id} className="flex flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  {i > 0 && (
                    <div
                      className={
                        "h-0.5 flex-1 " +
                        (timeline[i - 1]?.done ? "bg-emerald-500" : "bg-ink-muted/20")
                      }
                    />
                  )}
                  <span
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                      (step.done
                        ? "bg-emerald-600 text-white"
                        : step.active
                          ? "bg-emerald-600/20 text-emerald-700 ring-2 ring-emerald-500/40"
                          : "bg-ink-muted/15 text-ink-muted")
                    }
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  {i < timeline.length - 1 && (
                    <div
                      className={
                        "h-0.5 flex-1 " +
                        (step.done ? "bg-emerald-500" : "bg-ink-muted/20")
                      }
                    />
                  )}
                </div>
                <span
                  className={
                    "mt-1.5 text-[9px] font-semibold leading-tight " +
                    (step.done || step.active ? "text-ink" : "text-ink-muted")
                  }
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Legs */}
        <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
          Selections
        </p>
        <div className="space-y-2">
          {legs.map((leg, idx) => {
            const m = matches[leg.matchId];
            const { market, pick } = resolveSelection(
              leg.selectionId,
              leg.selectionLabel,
              (leg as { marketType?: string }).marketType
            );
            const result = legResult(leg, m);
            const score = m
              ? m.homeScore != null && m.awayScore != null
                ? (m.homeScore) + " – " + (m.awayScore)
                : m.currentHomeScore != null && m.currentAwayScore != null
                  ? (m.currentHomeScore) + " – " + (m.currentAwayScore)
                  : null
              : null;

            return (
              <div
                key={leg.matchId + "-" + idx}
                className="rounded-2xl border border-ink-muted/12 bg-surface p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">
                      {matchLabel(leg, matches, teams)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {market} · <span className="font-semibold text-ink">{pick}</span>
                    </p>
                    {score && (
                      <p className="mt-1 text-xs font-semibold tabular-nums text-ink">
                        FT {score}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-ink">
                      {Number(leg.odds || 0).toFixed(2)}
                    </p>
                    <span
                      className={
                        "mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase " +
                        statusStyle(result === "pending" ? "open" : result)
                      }
                    >
                      {result}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {bet.status === "won" && (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-4 text-center dark:bg-emerald-950/40">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Paid out
            </p>
            <p
              className="mt-1 break-all text-xl font-bold tabular-nums text-emerald-700"
              title={formatMoneyFull(ret)}
            >
              +{formatMoney(ret)}
            </p>
          </div>
        )}
        {bet.status === "lost" && (
          <div className="mt-4 rounded-2xl bg-rose-50 py-3 text-center text-sm font-semibold text-rose-700 dark:bg-rose-950/30">
            Lost · No return
          </div>
        )}
        {bet.status === "void" && (
          <div className="mt-4 rounded-2xl bg-ink-muted/10 py-3 text-center text-sm font-semibold text-ink-muted">
            Void · Stake returned
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-muted/15 bg-surface/95 px-3 py-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            type="button"
            onClick={onBetAgain}
            className="flex-1 rounded-xl border border-emerald-600/40 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-400"
          >
            Bet again
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
        }
