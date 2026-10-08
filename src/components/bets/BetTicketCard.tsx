"use client";

import type { Bet, Match, Team } from "@/types/domain";
import { formatMoney, formatMoneyFull, resolveSelection } from "@/lib/domain/selectionLabel";
import {
  betLegs,
  displayOdds,
  matchLabel,
  settledReturn,
  statusStyle,
  totalOdds,
} from "./myBetsUtils";

export function BetTicketCard({
  bet,
  matches,
  teams,
  onOpen,
  onMenu,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
  onOpen: () => void;
  onMenu?: () => void;
}) {
  const legs = betLegs(bet);
  const isAcca = legs.length > 1;
  const first = legs[0];
  const title = isAcca
    ? "Accumulator · " + legs.length + " legs"
    : first
      ? matchLabel(first, matches, teams)
      : "Ticket";
  const { market, pick } = resolveSelection(
    first?.selectionId ?? bet.selectionId,
    first?.selectionLabel ?? bet.selectionLabel,
    (first as { marketType?: string } | undefined)?.marketType
  );
  const odds = bet.status === "open" ? totalOdds(bet) : displayOdds(bet);
  const ret = settledReturn(bet);
  const isWon = bet.status === "won";
  const isOpen = bet.status === "open";

  return (
    <article className="overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface shadow-sm">
      <button type="button" onClick={onOpen} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] text-ink-muted">
              {bet.id.slice(0, 10).toUpperCase()}
              <span className="mx-1 opacity-40">·</span>
              {new Date(bet.placedAt).toLocaleString("en-NG", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-ink">{title}</p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {isAcca ? legs.length + " selections" : market + " · " + pick}
            </p>
          </div>
          <span
            className={
              "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase " +
              statusStyle(bet.status)
            }
          >
            {bet.status}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-bg/80 px-3 py-2.5">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
              Stake
            </p>
            <p
              className="mt-0.5 text-sm font-bold tabular-nums text-ink"
              title={formatMoneyFull(bet.stake)}
            >
              {formatMoney(bet.stake)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
              Odds
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">
              {odds.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
              {isWon ? "Return" : isOpen ? "Pot. win" : "Return"}
            </p>
            <p
              className={
                "mt-0.5 text-sm font-bold tabular-nums " +
                (isWon ? "text-emerald-600" : "text-ink")
              }
              title={formatMoneyFull(ret)}
            >
              {isWon ? "+" : ""}
              {formatMoney(ret)}
            </p>
          </div>
        </div>
      </button>

      {onMenu && bet.status !== "open" && (
        <div className="flex border-t border-ink-muted/10">
          <button
            type="button"
            onClick={onMenu}
            className="flex-1 py-2 text-center text-[11px] font-semibold text-ink-muted"
          >
            Hide from list
          </button>
        </div>
      )}
    </article>
  );
}
