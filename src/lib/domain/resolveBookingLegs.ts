/**
 * Server-side leg resolution for booking codes + Bet Again.
 * Never trusts client odds — always reads live market selections.
 */
import { adminDb } from "@/lib/firebase/admin";
import { isBettingOpen } from "@/lib/domain/matchClock";
import type { BetLeg, Market, Match, Team } from "@/types/domain";

export type RawLegInput = {
  matchId?: string;
  marketId?: string;
  selectionId?: string;
  /** Prior odds (from ticket / stored code) — used only to detect changes */
  odds?: number;
  selectionLabel?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  marketName?: string;
};

export type ResolvedLeg = BetLeg & {
  homeTeamName: string;
  awayTeamName: string;
  marketName: string;
  previousOdds?: number;
  oddsChanged: boolean;
};

export type DroppedLeg = {
  index: number;
  reason: string;
  matchId?: string;
  selectionLabel?: string;
};

export type ResolveBookingResult = {
  legs: ResolvedLeg[];
  totalOdds: number;
  dropped: DroppedLeg[];
  oddsChangedCount: number;
};

function marketLabel(type: string | undefined, fallback: string): string {
  if (!type) return fallback;
  const map: Record<string, string> = {
    "1x2": "1X2",
    match_result: "1X2",
    double_chance: "Double chance",
    over_under: "Over / Under",
    btts: "Both teams to score",
    dnb: "Draw no bet",
    correct_score: "Correct score",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

export async function resolveBookingLegs(
  rawLegs: RawLegInput[]
): Promise<ResolveBookingResult> {
  const legs: ResolvedLeg[] = [];
  const dropped: DroppedLeg[] = [];
  let totalOdds = 1;
  let oddsChangedCount = 0;

  for (let i = 0; i < rawLegs.length; i++) {
    const raw = rawLegs[i]!;
    const matchId = String(raw.matchId ?? "").trim();
    const marketId = String(raw.marketId ?? "").trim();
    const selectionId = String(raw.selectionId ?? "").trim();
    const priorOdds = Number(raw.odds);

    if (!matchId || !marketId || !selectionId) {
      dropped.push({
        index: i,
        reason: "Missing match, market or selection",
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }

    const [matchSnap, marketSnap] = await Promise.all([
      adminDb.collection("matches").doc(matchId).get(),
      adminDb.collection("markets").doc(marketId).get(),
    ]);

    if (!matchSnap.exists) {
      dropped.push({
        index: i,
        reason: "Match not found",
        matchId,
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }
    if (!marketSnap.exists) {
      dropped.push({
        index: i,
        reason: "Market not found",
        matchId,
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }

    const match = { ...(matchSnap.data() as Match), id: matchSnap.id };
    const market = { ...(marketSnap.data() as Market), id: marketSnap.id };

    if (!isBettingOpen(match)) {
      dropped.push({
        index: i,
        reason: "Match no longer open for betting",
        matchId,
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }
    if (market.status !== "active") {
      dropped.push({
        index: i,
        reason: "Market not active",
        matchId,
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }
    if (market.matchId !== match.id && market.matchId !== matchId) {
      dropped.push({
        index: i,
        reason: "Market does not belong to match",
        matchId,
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }

    const selection = market.selections?.find((s) => s.id === selectionId);
    if (!selection) {
      dropped.push({
        index: i,
        reason: "Selection not on market",
        matchId,
        selectionLabel: raw.selectionLabel,
      });
      continue;
    }
    if (
      (selection as { suspended?: boolean }).suspended === true ||
      (selection as { active?: boolean }).active === false
    ) {
      dropped.push({
        index: i,
        reason: "Selection suspended",
        matchId,
        selectionLabel: raw.selectionLabel || selection.label,
      });
      continue;
    }

    const liveOdds = Number(selection.odds);
    if (!Number.isFinite(liveOdds) || liveOdds < 1.01) {
      dropped.push({
        index: i,
        reason: "Invalid live odds",
        matchId,
        selectionLabel: selection.label,
      });
      continue;
    }

    let homeTeamName = (raw.homeTeamName || "").trim();
    let awayTeamName = (raw.awayTeamName || "").trim();
    if (!homeTeamName || !awayTeamName) {
      const [homeSnap, awaySnap] = await Promise.all([
        match.homeTeamId
          ? adminDb.collection("teams").doc(match.homeTeamId).get()
          : Promise.resolve(null),
        match.awayTeamId
          ? adminDb.collection("teams").doc(match.awayTeamId).get()
          : Promise.resolve(null),
      ]);
      if (!homeTeamName && homeSnap && "exists" in homeSnap && homeSnap.exists) {
        homeTeamName = (homeSnap.data() as Team).name || "Home";
      }
      if (!awayTeamName && awaySnap && "exists" in awaySnap && awaySnap.exists) {
        awayTeamName = (awaySnap.data() as Team).name || "Away";
      }
    }
    if (!homeTeamName) homeTeamName = "Home";
    if (!awayTeamName) awayTeamName = "Away";

    const oddsChanged =
      Number.isFinite(priorOdds) &&
      priorOdds >= 1.01 &&
      Math.abs(priorOdds - liveOdds) >= 0.01;
    if (oddsChanged) oddsChangedCount += 1;

    legs.push({
      matchId,
      marketId,
      selectionId: selection.id,
      selectionLabel: selection.label || selectionId,
      marketType: market.type,
      odds: liveOdds,
      homeTeamName,
      awayTeamName,
      marketName: marketLabel(market.type, raw.marketName || "Market"),
      previousOdds: oddsChanged ? priorOdds : undefined,
      oddsChanged,
    });
    totalOdds *= liveOdds;
  }

  totalOdds = Math.round(totalOdds * 10000) / 10000;
  return { legs, totalOdds, dropped, oddsChangedCount };
}
