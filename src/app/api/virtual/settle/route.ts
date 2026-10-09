import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { ensureCasinoDemoWallet } from "@/lib/casino/demoWallet";
import { buildCurrentRound, buildRoundByIndex } from "@/lib/virtual/currentRound";
import {
  getOpenBetsForRound,
  markBetSettled,
} from "@/lib/virtual/bets";
import { selectionWins } from "@/lib/virtual/engine";
import type { VirtualSelection } from "@/types/virtual";

export const dynamic = "force-dynamic";

/** Credit demo chips after stake was already held at bet time. */
async function creditChips(uid: string, amount: number): Promise<number> {
  const ref = adminDb.collection("casino_wallets").doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const bal = snap.exists
      ? Number((snap.data() as { balance?: number }).balance) || 0
      : 0;
    const next = Math.floor((bal + amount) * 100) / 100;
    tx.set(
      ref,
      { uid, balance: next, updatedAt: Date.now() },
      { merge: true }
    );
    return next;
  });
}

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { roundId?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* optional */
  }

  const current = buildCurrentRound();
  let round = current.public;
  let internal = current.internal;

  if (body.roundId && body.roundId !== current.public.id) {
    const idx = Number(String(body.roundId).replace("VR-", ""));
    if (Number.isFinite(idx)) {
      const built = buildRoundByIndex(idx);
      round = built.public;
      internal = built.internal;
    }
  }

  if (round.phase === "betting") {
    return NextResponse.json(
      { error: "Round still open for betting" },
      { status: 400 }
    );
  }
  if (!round.results) {
    return NextResponse.json({ error: "Results not ready" }, { status: 400 });
  }

  const open = await getOpenBetsForRound(decoded.uid, round.id);
  if (open.length === 0) {
    const wallet = await ensureCasinoDemoWallet(decoded.uid);
    return NextResponse.json({
      ok: true,
      settled: [],
      results: round.results,
      balance: wallet.balance,
    });
  }

  const resultMap = new Map(round.results.map((r) => [r.matchId, r]));
  const settledOut: Array<{
    betId: string;
    status: "won" | "lost";
    payout: number;
    profit: number;
  }> = [];

  let balance = (await ensureCasinoDemoWallet(decoded.uid)).balance;

  for (const bet of open) {
    let allWon = true;
    for (const leg of bet.legs) {
      const res = resultMap.get(leg.matchId);
      if (!res) {
        allWon = false;
        break;
      }
      const sel = {
        market: leg.market,
        pick: leg.pick,
      } as VirtualSelection;
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

    if (payout > 0) {
      balance = await creditChips(decoded.uid, payout);
    }

    await markBetSettled(bet.id, status, payout);
    settledOut.push({
      betId: bet.id,
      status,
      payout,
      profit: allWon
        ? Math.floor((payout - bet.stake) * 100) / 100
        : -bet.stake,
    });
  }

  return NextResponse.json({
    ok: true,
    settled: settledOut,
    results: round.results,
    matches: internal.map((m) => ({
      id: m.id,
      home: m.home,
      away: m.away,
      league: m.league,
    })),
    balance,
  });
}
