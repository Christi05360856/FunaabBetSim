import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { ensureCasinoDemoWallet } from "@/lib/casino/demoWallet";
import {
  CRASH_BETTING_MS,
  CRASH_GROWTH_PER_SEC,
  CRASH_ROUND_MS,
  crashPointForRound,
  crashRoundIndex,
  crashWindow,
  hasCrashed,
  multiplierAt,
} from "@/lib/casino/crashShared";
import { dayCommitment, lagosDayKey } from "@/lib/fair/commit";

export const dynamic = "force-dynamic";

/**
 * GET — the shared Crash round, computed from the clock only (no database
 * reads), so the page can poll it cheaply.
 * GET ?mine=1 — also returns the player's chips and stake in this round
 * (the page asks for this once per round, not on every poll).
 * The crash point is revealed only after the crash.
 */
export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const index = crashRoundIndex(now);
    const { startsAt, flyAt, endsAt } = crashWindow(index);
    const crashed = hasCrashed(now, index);
    const mult = multiplierAt(now, index);

    const payload: Record<string, unknown> = {
      ok: true,
      index,
      startsAt,
      flyAt,
      endsAt,
      serverNow: now,
      phase: now < flyAt ? "betting" : crashed ? "crashed" : "flying",
      multiplier: Math.floor(mult * 100) / 100,
      crashPoint: crashed ? crashPointForRound(index) : null,
      growth: CRASH_GROWTH_PER_SEC,
      dayCommitment: dayCommitment(lagosDayKey(startsAt)),
      roundMs: CRASH_ROUND_MS,
      bettingMs: CRASH_BETTING_MS,
    };

    if (new URL(request.url).searchParams.get("mine") === "1") {
      const wallet = await ensureCasinoDemoWallet(decoded.uid);
      const stakeSnap = await adminDb
        .collection("casino_crash_stakes")
        .doc(`${decoded.uid}_${index}`)
        .get();
      payload.balance = wallet.balance;
      if (stakeSnap.exists) {
        const st = stakeSnap.data() as {
          stake?: number;
          cashedOut?: boolean;
          cashoutMult?: number;
          payout?: number;
        };
        payload.mine = {
          joined: true,
          stake: Number(st.stake) || 0,
          cashedOut: Boolean(st.cashedOut),
          cashoutMult: st.cashoutMult ?? null,
          payout: st.payout ?? null,
        };
      } else {
        payload.mine = { joined: false };
      }
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[casino/crash-round]", e);
    return NextResponse.json({ error: "Crash is unavailable right now" }, { status: 503 });
  }
}
