import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { settleCasinoPlay } from "@/lib/casino/demoWallet";
import { resolveDiceRound, validateDiceInput } from "@/lib/casino/dice";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const game = body.game;
  if (game !== "dice") {
    return NextResponse.json(
      { error: "Game not available yet" },
      { status: 400 }
    );
  }

  const parsed = validateDiceInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let { stake, target, direction } = parsed;
  if (stake < CASINO_MIN_STAKE || stake > CASINO_MAX_STAKE) {
    return NextResponse.json(
      {
        error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
      },
      { status: 400 }
    );
  }

  // Resolve outcome server-side BEFORE debit (roll is independent of balance)
  const round = resolveDiceRound({ stake, target, direction });

  const settled = await settleCasinoPlay({
    uid: decoded.uid,
    game: "dice",
    stake,
    payout: round.payout,
    meta: {
      target,
      direction,
      roll: round.roll,
      won: round.won,
      multiplier: round.multiplier,
    },
  });

  if (!settled.ok) {
    const status = settled.code === "INSUFFICIENT" ? 400 : 400;
    return NextResponse.json({ error: settled.error, code: settled.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    game: "dice",
    stake,
    target,
    direction,
    roll: round.roll,
    won: round.won,
    multiplier: round.multiplier,
    payout: round.payout,
    profit: round.profit,
    balanceAfter: settled.balanceAfter,
    playId: settled.playId,
  });
}
