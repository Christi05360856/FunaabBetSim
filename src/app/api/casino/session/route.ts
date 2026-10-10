import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import {
  cashoutMinesSession,
  revealMinesTile,
  startMinesSession,
  validateMinesSessionStart,
} from "@/lib/casino/minesSession";
import {
  cashoutHilo,
  guessHilo,
  hiloOdds,
  startHiloSession,
  validateHiloSessionStart,
} from "@/lib/casino/hiloSession";
import type { HiloChoice } from "@/types/casino";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * Stateful demo-chip games where the server holds the game: Mines and Hi-Lo.
 * Every start, step and cash-out is one transaction, and the hidden mine
 * layout / next card never leaves the server until the game is over.
 */
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) return fail("Unauthorized", 401);

  const limited = await enforceRateLimit("casino_play", `sess:${decoded.uid}`);
  if (limited) return limited;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON");
  }

  const uid = decoded.uid;
  const game = body.game;
  const action = body.action;
  const sessionId = String(body.sessionId ?? "");

  // ---------------- MINES ----------------
  if (game === "mines") {
    if (action === "start") {
      const parsed = validateMinesSessionStart(body);
      if (!parsed.ok) return fail(parsed.error);
      const out = await startMinesSession({
        uid,
        stake: parsed.stake,
        mineCount: parsed.mineCount,
      });
      if (!out.ok) return fail(out.error);
      return NextResponse.json({
        ok: true,
        sessionId: out.session.id,
        mineCount: out.session.mineCount,
        revealed: [],
        status: out.session.status,
        seedHash: out.session.seedHash,
        balance: out.balance,
      });
    }

    if (action === "reveal") {
      const out = await revealMinesTile({
        uid,
        sessionId,
        tile: Number(body.tile),
      });
      if (!out.ok) return fail(out.error);
      return NextResponse.json({
        ok: true,
        hit: out.hit,
        tile: Number(body.tile),
        revealed: out.revealed,
        status: out.status,
        multiplier: out.multiplier,
        mines: out.mines,
        seed: out.seed,
      });
    }

    if (action === "cashout") {
      const out = await cashoutMinesSession({ uid, sessionId });
      if (!out.ok) return fail(out.error);
      return NextResponse.json({
        ok: true,
        multiplier: out.multiplier,
        payout: out.payout,
        profit: out.profit,
        balance: out.balance,
        mines: out.mines,
        seed: out.seed,
      });
    }
  }

  // ---------------- HI-LO ----------------
  if (game === "hilo") {
    if (action === "start") {
      const parsed = validateHiloSessionStart(body);
      if (!parsed.ok) return fail(parsed.error);
      const out = await startHiloSession({ uid, stake: parsed.stake });
      if (!out.ok) return fail(out.error);
      return NextResponse.json({
        ok: true,
        sessionId: out.session.id,
        card: out.session.card,
        streak: 0,
        multiplier: 1,
        odds: hiloOdds(out.session.card),
        seedHash: out.session.seedHash,
        balance: out.balance,
      });
    }

    if (action === "guess") {
      const choice = body.choice as HiloChoice;
      if (choice !== "higher" && choice !== "lower") {
        return fail("Choose higher or lower");
      }
      const out = await guessHilo({ uid, sessionId, choice });
      if (!out.ok) return fail(out.error);
      return NextResponse.json(out);
    }

    if (action === "cashout") {
      const out = await cashoutHilo({ uid, sessionId });
      if (!out.ok) return fail(out.error);
      return NextResponse.json(out);
    }
  }

  return fail("Unknown game/action");
}
