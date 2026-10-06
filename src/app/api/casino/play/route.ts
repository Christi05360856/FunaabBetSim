import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { settleCasinoPlay } from "@/lib/casino/demoWallet";
import { resolveDiceRound, validateDiceInput } from "@/lib/casino/dice";
import { resolveCoinRound, validateCoinInput } from "@/lib/casino/coin";
import { resolveMinesRound, validateMinesInput } from "@/lib/casino/mines";
import { resolveWheelRound, validateWheelInput } from "@/lib/casino/wheel";
import { resolveCrashRound, validateCrashInput } from "@/lib/casino/crash";
import { resolveThimblesRound, validateThimblesInput } from "@/lib/casino/thimbles";
import { resolvePenaltyRound, validatePenaltyInput } from "@/lib/casino/penalty";
import { resolveCampusCrashRound, validateCampusCrashInput } from "@/lib/casino/campusCrash";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";

export const dynamic = "force-dynamic";

function stakeOk(stake: number) {
  return stake >= CASINO_MIN_STAKE && stake <= CASINO_MAX_STAKE;
}

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

  try {
    if (game === "dice") {
      const parsed = validateDiceInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveDiceRound({
        stake: parsed.stake,
        target: parsed.target,
        direction: parsed.direction,
      });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "dice",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          target: parsed.target,
          direction: parsed.direction,
          roll: round.roll,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "dice",
        stake: parsed.stake,
        target: parsed.target,
        direction: parsed.direction,
        roll: round.roll,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    if (game === "coin") {
      const parsed = validateCoinInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveCoinRound({
        stake: parsed.stake,
        pick: parsed.pick,
      });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "coin",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          pick: parsed.pick,
          flip: round.flip,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "coin",
        stake: parsed.stake,
        pick: parsed.pick,
        flip: round.flip,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    if (game === "mines") {
      const parsed = validateMinesInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveMinesRound({
        stake: parsed.stake,
        mineCount: parsed.mineCount,
        picks: parsed.picks,
      });
      if (round.error) {
        return NextResponse.json({ error: round.error }, { status: 400 });
      }
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "mines",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          mineCount: parsed.mineCount,
          picks: round.picks,
          mines: round.mines,
          hit: round.hit,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "mines",
        stake: parsed.stake,
        mineCount: parsed.mineCount,
        picks: round.picks,
        mines: round.mines,
        hit: round.hit,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    if (game === "wheel") {
      const parsed = validateWheelInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveWheelRound({ stake: parsed.stake });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "wheel",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          segment: round.segment,
          multiplier: round.multiplier,
          won: round.won,
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
        game: "wheel",
        stake: parsed.stake,
        segment: round.segment,
        multiplier: round.multiplier,
        won: round.won,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    if (game === "crash") {
      const parsed = validateCrashInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveCrashRound({
        stake: parsed.stake,
        cashoutAt: parsed.cashoutAt,
      });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "crash",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          cashoutAt: round.cashoutAt,
          crashPoint: round.crashPoint,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "crash",
        stake: parsed.stake,
        cashoutAt: round.cashoutAt,
        crashPoint: round.crashPoint,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }


    if (game === "thimbles") {
      const parsed = validateThimblesInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveThimblesRound({
        stake: parsed.stake,
        pick: parsed.pick,
      });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "thimbles",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          pick: round.pick,
          ball: round.ball,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "thimbles",
        stake: parsed.stake,
        pick: round.pick,
        ball: round.ball,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    if (game === "penalty") {
      const parsed = validatePenaltyInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolvePenaltyRound({
        stake: parsed.stake,
        shot: parsed.shot,
      });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "penalty",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          shot: round.shot,
          keeper: round.keeper,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "penalty",
        stake: parsed.stake,
        shot: round.shot,
        keeper: round.keeper,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    if (game === "campus-crash") {
      const parsed = validateCampusCrashInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      if (!stakeOk(parsed.stake)) {
        return NextResponse.json(
          {
            error: `Stake must be between ${CASINO_MIN_STAKE} and ${CASINO_MAX_STAKE}`,
          },
          { status: 400 }
        );
      }
      const round = resolveCampusCrashRound({
        stake: parsed.stake,
        cashoutAt: parsed.cashoutAt,
      });
      const settled = await settleCasinoPlay({
        uid: decoded.uid,
        game: "campus-crash",
        stake: parsed.stake,
        payout: round.payout,
        meta: {
          cashoutAt: round.cashoutAt,
          crashPoint: round.crashPoint,
          won: round.won,
          multiplier: round.multiplier,
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
        game: "campus-crash",
        stake: parsed.stake,
        cashoutAt: round.cashoutAt,
        crashPoint: round.crashPoint,
        won: round.won,
        multiplier: round.multiplier,
        payout: round.payout,
        profit: round.profit,
        balanceAfter: settled.balanceAfter,
        playId: settled.playId,
      });
    }

    return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  } catch (e) {
    console.error("[casino/play]", e);
    return NextResponse.json({ error: "Play failed" }, { status: 500 });
  }
        }
  
