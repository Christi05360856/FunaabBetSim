import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { settleCasinoPlay } from "@/lib/casino/demoWallet";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import { getVirtualRound } from "@/lib/virtual/rounds";
import {
  lookupOdds,
  resolveScore,
  selectionWins,
} from "@/lib/virtual/engine";
import type { VirtualSelection } from "@/types/virtual";

export const dynamic = "force-dynamic";

type PlayLegIn = {
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
    `virt_play:${decoded.uid}:${ip}`
  );
  if (limited) return limited;

  let body: {
    roundId?: string;
    stake?: number;
    legs?: PlayLegIn[];
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roundId = String(body.roundId ?? "").trim();
  const stake = Number(body.stake);
  const rawLegs = body.legs;

  if (!roundId) {
    return NextResponse.json({ error: "Missing round id" }, { status: 400 });
  }
  if (
    !Number.isFinite(stake) ||
    stake < CASINO_MIN_STAKE ||
    stake > CASINO_MAX_STAKE
  ) {
    return NextResponse.json(
      {
        error: `Stake must be ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE} chips`,
      },
      { status: 400 }
    );
  }
  if (!Array.isArray(rawLegs) || rawLegs.length === 0 || rawLegs.length > 8) {
    return NextResponse.json(
      { error: "Select 1–8 virtual picks" },
      { status: 400 }
    );
  }

  const round = await getVirtualRound(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (Date.now() > round.expiresAt) {
    return NextResponse.json(
      { error: "This board expired — deal a new one" },
      { status: 410 }
    );
  }

  const matchMap = new Map(round.matches.map((m) => [m.id, m]));
  const seenMatches = new Set<string>();
  const resolvedLegs: Array<{
    matchId: string;
    home: string;
    away: string;
    market: string;
    pick: string;
    odds: number;
    homeGoals: number;
    awayGoals: number;
    won: boolean;
  }> = [];

  let combinedOdds = 1;

  for (const raw of rawLegs) {
    const matchId = String(raw.matchId ?? "").trim();
    const market = String(raw.market ?? "").trim();
    const pick = String(raw.pick ?? "").trim().toLowerCase();

    if (!matchId || !market || !pick) {
      return NextResponse.json({ error: "Invalid leg" }, { status: 400 });
    }
    if (seenMatches.has(matchId)) {
      return NextResponse.json(
        { error: "Only one market per match on a virtual slip" },
        { status: 400 }
      );
    }
    seenMatches.add(matchId);

    const match = matchMap.get(matchId);
    if (!match) {
      return NextResponse.json(
        { error: "Match not on this board" },
        { status: 400 }
      );
    }

    const serverOdds = lookupOdds(match, market, pick);
    if (serverOdds == null) {
      return NextResponse.json(
        { error: "Unknown market or pick" },
        { status: 400 }
      );
    }

    const clientOdds = Number(raw.odds);
    if (
      Number.isFinite(clientOdds) &&
      Math.abs(clientOdds - serverOdds) / serverOdds > 0.02
    ) {
      return NextResponse.json(
        { error: "Odds changed — refresh the board" },
        { status: 409 }
      );
    }

    const score = resolveScore(match.homeStrength, match.awayStrength);

    let sel: VirtualSelection;
    if (market === "1x2") {
      if (pick !== "home" && pick !== "draw" && pick !== "away") {
        return NextResponse.json(
          { error: "Invalid 1X2 pick" },
          { status: 400 }
        );
      }
      sel = { market: "1x2", pick };
    } else if (market === "ou25") {
      if (pick !== "over" && pick !== "under") {
        return NextResponse.json(
          { error: "Invalid O/U pick" },
          { status: 400 }
        );
      }
      sel = { market: "ou25", pick };
    } else if (market === "btts") {
      if (pick !== "yes" && pick !== "no") {
        return NextResponse.json(
          { error: "Invalid BTTS pick" },
          { status: 400 }
        );
      }
      sel = { market: "btts", pick };
    } else {
      return NextResponse.json({ error: "Unknown market" }, { status: 400 });
    }

    const won = selectionWins(score, sel);
    combinedOdds *= serverOdds;
    resolvedLegs.push({
      matchId,
      home: match.home,
      away: match.away,
      market,
      pick,
      odds: serverOdds,
      homeGoals: score.homeGoals,
      awayGoals: score.awayGoals,
      won,
    });
  }

  combinedOdds = Math.round(combinedOdds * 10000) / 10000;
  const allWon = resolvedLegs.every((l) => l.won);
  const stakeRounded = Math.floor(stake * 100) / 100;
  const payout = allWon
    ? Math.floor(stakeRounded * combinedOdds * 100) / 100
    : 0;

  const settled = await settleCasinoPlay({
    uid: decoded.uid,
    game: "virtual-football",
    stake: stakeRounded,
    payout,
    meta: {
      roundId,
      legs: resolvedLegs,
      combinedOdds,
      allWon,
    },
  });

  if (!settled.ok) {
    return NextResponse.json(
      { error: settled.error, code: settled.code },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    allWon,
    payout,
    profit: allWon
      ? Math.floor((payout - stakeRounded) * 100) / 100
      : -stakeRounded,
    combinedOdds,
    legs: resolvedLegs,
    balance: settled.balanceAfter,
  });
}
