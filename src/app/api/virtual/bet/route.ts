import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { settleCasinoPlay } from "@/lib/casino/demoWallet";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import { buildCurrentRound } from "@/lib/virtual/currentRound";
import { lookupOdds, selectionWins } from "@/lib/virtual/engine";
import { placeVirtualBet } from "@/lib/virtual/bets";
import type { VirtualBetLeg, VirtualSelection } from "@/types/virtual";

export const dynamic = "force-dynamic";

type LegIn = {
  matchId?: string;
  market?: string;
  pick?: string;
  odds?: number;
};

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);
  const limited = await enforceRateLimit(
    "book_code",
    `virt_bet:${decoded.uid}:${ip}`
  );
  if (limited) return limited;

  let body: { stake?: number; legs?: LegIn[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stake = Number(body.stake);
  const rawLegs = body.legs;
  if (
    !Number.isFinite(stake) ||
    stake < CASINO_MIN_STAKE ||
    stake > CASINO_MAX_STAKE
  ) {
    return NextResponse.json(
      { error: `Stake must be ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE}` },
      { status: 400 }
    );
  }
  if (!Array.isArray(rawLegs) || rawLegs.length < 1 || rawLegs.length > 8) {
    return NextResponse.json(
      { error: "Select 1–8 virtual picks" },
      { status: 400 }
    );
  }

  const { public: round, internal } = buildCurrentRound();
  if (round.phase !== "betting") {
    return NextResponse.json(
      { error: "Betting closed — wait for next round" },
      { status: 400 }
    );
  }

  const matchMap = new Map(internal.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const legs: VirtualBetLeg[] = [];
  let combined = 1;

  for (const raw of rawLegs) {
    const matchId = String(raw.matchId ?? "");
    const market = String(raw.market ?? "");
    const pick = String(raw.pick ?? "");
    if (!matchId || seen.has(matchId)) {
      return NextResponse.json(
        { error: "One pick per match" },
        { status: 400 }
      );
    }
    seen.add(matchId);
    const m = matchMap.get(matchId);
    if (!m) {
      return NextResponse.json({ error: "Unknown match" }, { status: 400 });
    }
    const pub = {
      id: m.id,
      league: m.league,
      home: m.home,
      away: m.away,
      odds1x2: m.odds1x2,
      oddsOu25: m.oddsOu25,
      oddsBtts: m.oddsBtts,
    };
    const serverOdds = lookupOdds(pub, market, pick);
    if (serverOdds == null) {
      return NextResponse.json({ error: "Unknown market/pick" }, { status: 400 });
    }
    const clientOdds = Number(raw.odds);
    if (
      Number.isFinite(clientOdds) &&
      Math.abs(clientOdds - serverOdds) / serverOdds > 0.03
    ) {
      return NextResponse.json(
        { error: "Odds changed — refresh board" },
        { status: 409 }
      );
    }
    legs.push({
      matchId,
      market: market as VirtualBetLeg["market"],
      pick,
      odds: serverOdds,
    });
    combined *= serverOdds;
  }

  combined = Math.round(combined * 10000) / 10000;
  const stakeR = Math.floor(stake * 100) / 100;

  // Hold stake immediately (payout 0 until settle after kickoff)
  const held = await settleCasinoPlay({
    uid: decoded.uid,
    game: "virtual-football",
    stake: stakeR,
    payout: 0,
    meta: {
      phase: "stake_hold",
      roundId: round.id,
      legs,
      combinedOdds: combined,
    },
  });
  if (!held.ok) {
    return NextResponse.json(
      { error: held.error, code: held.code },
      { status: 400 }
    );
  }

  const bet = await placeVirtualBet({
    uid: decoded.uid,
    roundId: round.id,
    roundIndex: round.index,
    stake: stakeR,
    legs,
    combinedOdds: combined,
  });

  return NextResponse.json({
    ok: true,
    betId: bet.id,
    roundId: round.id,
    stake: stakeR,
    combinedOdds: combined,
    potential: Math.floor(stakeR * combined * 100) / 100,
    balance: held.balanceAfter,
    kickoffAt: round.kickoffAt,
  });
}
