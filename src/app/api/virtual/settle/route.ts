import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { ensureCasinoDemoWallet } from "@/lib/casino/demoWallet";
import { buildCurrentRound, buildRoundByIndex } from "@/lib/virtual/currentRound";
import {
  getOpenBetsForRound,
  settleVirtualBetAtomic,
} from "@/lib/virtual/bets";
import { resolveRoundResults, selectionWins } from "@/lib/virtual/engine";
import { phaseAt } from "@/lib/virtual/schedule";
import type { VirtualSelection } from "@/types/virtual";

export const dynamic = "force-dynamic";

/**
 * POST { roundId?, kickoff?: boolean }
 * - Normal settle after shared clock goes live/result
 * - kickoff: true → user pressed "Kick Off": reveal deterministic results
 *   and settle even while the shared board is still in "betting"
 *   (Sporty-style: user starts play, no forced wait)
 */
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { roundId?: string; kickoff?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  const now = Date.now();
  const currentIndex = phaseAt(now).index;
  let built = buildCurrentRound(now);

  if (body.roundId && body.roundId !== built.public.id) {
    const match = /^VR-(\d{1,9})$/.exec(String(body.roundId));
    const idx = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(idx) || idx < 0 || idx > currentIndex) {
      return NextResponse.json({ error: "Unknown round" }, { status: 400 });
    }
    built = buildRoundByIndex(idx, now);
  }

  const round = built.public;
  const internal = built.internal;
  const kickoff = body.kickoff === true;

  // Results are always derivable from the round seed (provably fair).
  // We only expose them on kickoff or after the shared clock leaves betting.
  if (round.phase === "betting" && !kickoff) {
    return NextResponse.json(
      { error: "Round still open — press Kick Off to play" },
      { status: 400 }
    );
  }

  const results =
    round.results ?? resolveRoundResults(built.seed, internal);

  const open = await getOpenBetsForRound(decoded.uid, round.id);
  if (open.length === 0) {
    const wallet = await ensureCasinoDemoWallet(decoded.uid);
    return NextResponse.json({
      ok: true,
      settled: [],
      results,
      matches: internal.map((m) => ({
        id: m.id,
        home: m.home,
        away: m.away,
        league: m.league,
      })),
      balance: wallet.balance,
    });
  }

  const resultMap = new Map(results.map((r) => [r.matchId, r]));
  const settledOut: Array<{
    betId: string;
    status: "won" | "lost";
    payout: number;
    profit: number;
  }> = [];
  let balance: number | null = null;

  for (const bet of open) {
    let allWon = true;
    for (const leg of bet.legs) {
      const res = resultMap.get(leg.matchId);
      if (!res) {
        allWon = false;
        break;
      }
      const sel = { market: leg.market, pick: leg.pick } as VirtualSelection;
      if (
        !selectionWins(
          { homeGoals: res.homeGoals, awayGoals: res.awayGoals },
          sel
        )
      ) {
        allWon = false;
        break;
      }
    }
    const payout = allWon
      ? Math.floor(bet.stake * bet.combinedOdds * 100) / 100
      : 0;
    const status = allWon ? ("won" as const) : ("lost" as const);

    const done = await settleVirtualBetAtomic({
      betId: bet.id,
      uid: decoded.uid,
      status,
      payout,
    });
    if (!done.ok) continue;

    balance = done.balanceAfter;
    settledOut.push({
      betId: bet.id,
      status,
      payout,
      profit: allWon
        ? Math.floor((payout - bet.stake) * 100) / 100
        : -bet.stake,
    });
  }

  if (balance === null) {
    balance = (await ensureCasinoDemoWallet(decoded.uid)).balance;
  }

  return NextResponse.json({
    ok: true,
    settled: settledOut,
    results,
    matches: internal.map((m) => ({
      id: m.id,
      home: m.home,
      away: m.away,
      league: m.league,
    })),
    balance,
  });
}
  
