import type { Bet, BetLeg, Match, Team } from "@/types/domain";
import type { SlipItem } from "@/lib/context/BetSlipContext";
import { resolveSelection } from "@/lib/domain/selectionLabel";

export type BetFilter = "all" | "open" | "won" | "lost" | "void";

export function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel || "",
      odds:
        bet.oddsAtPlacement ||
        (bet.stake > 0 && bet.potentialPayout
          ? bet.potentialPayout / bet.stake
          : 1),
    },
  ];
}

export function totalOdds(bet: Bet): number {
  const legs = betLegs(bet);
  if (legs.length === 0) return bet.oddsAtPlacement || 1;
  return legs.reduce((acc, l) => acc * (l.odds || 1), 1);
}

/** Actual return after settlement (void-adjusted). Open → potential. */
export function settledReturn(bet: Bet): number {
  if (bet.status === "won") {
    const p = Number(bet.payout);
    if (Number.isFinite(p) && p > 0) return p;
    return bet.potentialPayout || bet.stake * totalOdds(bet);
  }
  if (bet.status === "void") return bet.stake;
  if (bet.status === "lost") return 0;
  return bet.potentialPayout || bet.stake * totalOdds(bet);
}

export function displayOdds(bet: Bet): number {
  if (bet.status === "won" || bet.status === "lost" || bet.status === "void") {
    const p = Number(bet.payout);
    if (bet.status === "won" && Number.isFinite(p) && p > 0 && bet.stake > 0) {
      return p / bet.stake;
    }
    const active = betLegs(bet).filter((l) => l.status !== "void");
    if (active.length > 0) {
      return active.reduce((acc, l) => acc * (l.odds || 1), 1);
    }
  }
  return totalOdds(bet);
}

export function statusStyle(status: string): string {
  if (status === "won")
    return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400";
  if (status === "lost")
    return "bg-rose-600/15 text-rose-700 dark:text-rose-400";
  if (status === "void") return "bg-ink-muted/15 text-ink-muted";
  return "bg-sky-600/15 text-sky-700 dark:text-sky-400";
}

export function legResult(
  leg: { selectionId: string; status?: string },
  match?: Match
): "won" | "lost" | "void" | "pending" {
  if (leg.status === "won" || leg.status === "lost" || leg.status === "void") {
    return leg.status;
  }
  if (!match) return "pending";
  const terminal =
    match.status === "settled" ||
    match.status === "finished" ||
    match.status === "result_confirmed" ||
    match.status === "voided";
  if (!terminal) return "pending";
  if (match.status === "voided") return "void";
  return "pending";
}

export function filterBets(bets: Bet[], filter: BetFilter): Bet[] {
  const visible = bets.filter((b) => !b.hidden);
  if (filter === "all") return visible;
  if (filter === "open") return visible.filter((b) => b.status === "open");
  return visible.filter((b) => b.status === filter);
}

export function countByFilter(bets: Bet[]): Record<BetFilter, number> {
  const visible = bets.filter((b) => !b.hidden);
  return {
    all: visible.length,
    open: visible.filter((b) => b.status === "open").length,
    won: visible.filter((b) => b.status === "won").length,
    lost: visible.filter((b) => b.status === "lost").length,
    void: visible.filter((b) => b.status === "void").length,
  };
}

export function matchLabel(
  leg: BetLeg,
  matches: Record<string, Match>,
  teams: Record<string, Team>
): string {
  const m = matches[leg.matchId];
  if (!m) return "Match";
  const home = teams[m.homeTeamId]?.name ?? "Home";
  const away = teams[m.awayTeamId]?.name ?? "Away";
  return home + " vs " + away;
}

/** Rebuild slip items from a ticket for Bet Again. */
export function legsToSlipItems(
  bet: Bet,
  matches: Record<string, Match>,
  teams: Record<string, Team>
): SlipItem[] {
  return betLegs(bet).map((leg) => {
    const m = matches[leg.matchId];
    const home = m ? teams[m.homeTeamId]?.name ?? "Home" : "Home";
    const away = m ? teams[m.awayTeamId]?.name ?? "Away" : "Away";
    const { market, pick } = resolveSelection(
      leg.selectionId,
      leg.selectionLabel,
      (leg as { marketType?: string }).marketType
    );
    return {
      matchId: leg.matchId,
      marketId: leg.marketId,
      selectionId: leg.selectionId,
      selectionLabel: leg.selectionLabel || pick,
      odds: leg.odds,
      homeTeamName: home,
      awayTeamName: away,
      marketName: market,
    };
  });
}

export type TimelineStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

export function settlementTimeline(
  bet: Bet,
  matches: Record<string, Match>
): TimelineStep[] {
  const legs = betLegs(bet);
  const placed = true;
  let anyStarted = false;
  let settledLegs = 0;
  for (const leg of legs) {
    const m = matches[leg.matchId];
    if (!m) continue;
    if (
      m.status === "live" ||
      m.status === "settled" ||
      m.status === "finished" ||
      m.status === "result_confirmed" ||
      m.status === "voided" ||
      (m.kickoffAt && m.kickoffAt <= Date.now())
    ) {
      anyStarted = true;
    }
    const r = legResult(leg, m);
    if (r === "won" || r === "lost" || r === "void") settledLegs += 1;
  }
  const ticketDone = bet.status !== "open";

  return [
    { id: "placed", label: "Placed", done: placed, active: !anyStarted && !ticketDone },
    {
      id: "started",
      label: "Started",
      done: anyStarted || ticketDone,
      active: anyStarted && settledLegs === 0 && !ticketDone,
    },
    {
      id: "legs",
      label:
        legs.length > 1
          ? "Legs " + settledLegs + "/" + legs.length
          : "Leg settled",
      done: settledLegs >= legs.length || ticketDone,
      active: settledLegs > 0 && settledLegs < legs.length && !ticketDone,
    },
    {
      id: "ticket",
      label:
        bet.status === "won"
          ? "Won"
          : bet.status === "lost"
            ? "Lost"
            : bet.status === "void"
              ? "Void"
              : "Ticket",
      done: ticketDone,
      active: ticketDone,
    },
  ];
}
