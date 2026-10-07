"use client";

import Link from "next/link";
import type { Match, Selection } from "@/types/domain";
import { LiveClockBadge } from "@/components/LiveClock";
import { OddsButton } from "./OddsButton";

export type MatchCardSelection = Selection & { marketId?: string };

type Props = {
  match: Match;
  homeName: string;
  awayName: string;
  competitionName?: string;
  /** Primary 1X2 selections (home / draw / away) when bettable */
  odds1x2?: MatchCardSelection[];
  selectedIds?: Set<string>;
  canBet?: boolean;
  onToggleSelection?: (sel: MatchCardSelection) => void;
  compact?: boolean;
};

function statusTone(status: Match["status"]): string {
  if (
    status === "live" ||
    status === "halftime" ||
    status === "second_half"
  ) {
    return "border-l-red-500";
  }
  if (status === "finished" || status === "result_confirmed" || status === "settled") {
    return "border-l-ink-muted/40";
  }
  if (status === "postponed" || status === "voided" || status === "locked") {
    return "border-l-amber-500";
  }
  return "border-l-brand/70";
}

export function MatchCard({
  match,
  homeName,
  awayName,
  competitionName,
  odds1x2,
  selectedIds,
  canBet = false,
  onToggleSelection,
  compact = false,
}: Props) {
  const isLive =
    match.status === "live" ||
    match.status === "halftime" ||
    match.status === "second_half";
  const hasScore =
    match.homeScore != null && match.awayScore != null;
  const showOdds = canBet && odds1x2 && odds1x2.length > 0;

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-ink-muted/10 border-l-4 bg-surface shadow-card ${statusTone(
        match.status
      )}`}
    >
      <Link
        href={`/fixtures/${match.id}`}
        className="block px-3.5 pt-3 pb-2"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            {competitionName || "Match"}
          </p>
          <LiveClockBadge match={match} />
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`truncate font-semibold text-ink ${
                compact ? "text-sm" : "text-[15px]"
              }`}
            >
              {homeName}
            </p>
            <p
              className={`mt-0.5 truncate font-semibold text-ink ${
                compact ? "text-sm" : "text-[15px]"
              }`}
            >
              {awayName}
            </p>
          </div>

          {(isLive || hasScore) && hasScore && (
            <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
              <span
                className={`font-bold ${
                  isLive ? "text-red-600" : "text-ink"
                } ${compact ? "text-sm" : "text-base"}`}
              >
                {match.homeScore}
              </span>
              <span
                className={`font-bold ${
                  isLive ? "text-red-600" : "text-ink"
                } ${compact ? "text-sm" : "text-base"}`}
              >
                {match.awayScore}
              </span>
            </div>
          )}
        </div>
      </Link>

      {showOdds && (
        <div className="flex gap-1.5 border-t border-ink-muted/10 px-2.5 py-2">
          {odds1x2!.map((sel) => {
            const key = `${match.id}:${sel.id}`;
            const selected = selectedIds?.has(key) ?? false;
            return (
              <OddsButton
                key={sel.id}
                label={shortLabel(sel)}
                odds={sel.odds}
                selected={selected}
                disabled={!canBet}
                onClick={() => onToggleSelection?.(sel)}
              />
            );
          })}
        </div>
      )}

      {!showOdds && !isLive && (
        <div className="border-t border-ink-muted/10 px-3.5 py-2">
          <Link
            href={`/fixtures/${match.id}`}
            className="text-[11px] font-semibold text-brand"
          >
            View markets →
          </Link>
        </div>
      )}
    </article>
  );
}

function shortLabel(sel: Selection): string {
  const id = sel.id.toLowerCase();
  const label = sel.label.toLowerCase();
  if (id === "1" || id === "home" || label.includes("home")) return "1";
  if (id === "x" || id === "draw" || label.includes("draw")) return "X";
  if (id === "2" || id === "away" || label.includes("away")) return "2";
  if (sel.label.length <= 4) return sel.label;
  return sel.label.slice(0, 3);
}
