import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { adminDb } from "@/lib/firebase/admin";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import {
  chipsRef,
  clampChips,
  readChips,
  writeChips,
  writePlay,
} from "@/lib/casino/chipsTx";
import {
  CRASH_MIN_CASHOUT,
  crashRoundIndex,
  crashWindow,
  hasCrashed,
  multiplierAt,
} from "@/lib/casino/crashShared";

export const dynamic = "force-dynamic";

type Fail = { ok: false; error: string; status: number };

/**
 * action "join"    — during the betting window: takes the stake.
 * action "cashout" — during flight: judged by SERVER time when this request
 *                    arrives. Both run inside one transaction, so a double
 *                    tap or a parallel request can never pay twice.
 */
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = clientIp(request);
  const limited = await enforceRateLimit(
    "casino_play",
    `crash:${decoded.uid}:${ip}`
  );
  if (limited) return limited;

  let body: { action?: string; stake?: number; roundIndex?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = Date.now();
  const index = crashRoundIndex(now);
  if (body.roundIndex != null && Number(body.roundIndex) !== index) {
    return NextResponse.json({ error: "Round moved on" }, { status: 409 });
  }

  const uid = decoded.uid;
  const { flyAt } = crashWindow(index);
  const stakeRef = adminDb.collection("casino_crash_stakes").doc(`${uid}_${index}`);

  // ---------- JOIN ----------
  if (body.action === "join") {
    if (now >= flyAt) {
      return NextResponse.json({ error: "Betting closed" }, { status: 400 });
    }
    const stake = clampChips(Number(body.stake));
    if (!Number.isFinite(stake) || stake < CASINO_MIN_STAKE || stake > CASINO_MAX_STAKE) {
      return NextResponse.json(
        { error: `Stake ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE}` },
        { status: 400 }
      );
    }
    try {
      const out = await adminDb.runTransaction(
        async (tx): Promise<{ ok: true; balance: number } | Fail> => {
          const existing = await tx.get(stakeRef);
          const balance = await readChips(tx, uid);
          if (existing.exists) {
            return { ok: false, error: "Already joined this round", status: 400 };
          }
          if (balance < stake) {
            return { ok: false, error: "Insufficient demo chips", status: 400 };
          }
          const after = writeChips(tx, uid, balance - stake, now);
          tx.set(stakeRef, {
            uid,
            roundIndex: index,
            stake,
            cashedOut: false,
            createdAt: now,
          });
          writePlay(
            tx,
            {
              uid,
              game: "crash",
              stake,
              payout: 0,
              balanceBefore: balance,
              balanceAfter: after,
              meta: { phase: "join", roundIndex: index },
            },
            now
          );
          return { ok: true, balance: after };
        }
      );
      if (!out.ok) {
        return NextResponse.json({ error: out.error }, { status: out.status });
      }
      return NextResponse.json({ ok: true, joined: true, stake, balance: out.balance });
    } catch (e) {
      console.error("[crash join]", e);
      return NextResponse.json({ error: "Could not join. Try again." }, { status: 500 });
    }
  }

  // ---------- CASH OUT ----------
  if (body.action === "cashout") {
    if (now < flyAt) {
      return NextResponse.json({ error: "Not flying yet" }, { status: 400 });
    }
    if (hasCrashed(now, index)) {
      return NextResponse.json({ error: "Already crashed" }, { status: 400 });
    }
    const mult = Math.floor(multiplierAt(now, index) * 100) / 100;
    if (mult < CRASH_MIN_CASHOUT) {
      return NextResponse.json({ error: "Too early to cash out" }, { status: 400 });
    }
    try {
      const out = await adminDb.runTransaction(
        async (tx): Promise<
          { ok: true; payout: number; stake: number; balance: number } | Fail
        > => {
          const snap = await tx.get(stakeRef);
          const wallet = await tx.get(chipsRef(uid));
          if (!snap.exists) {
            return { ok: false, error: "No stake this round", status: 400 };
          }
          const st = snap.data() as { stake: number; cashedOut?: boolean };
          if (st.cashedOut) {
            return { ok: false, error: "Already cashed out", status: 400 };
          }
          const balance = wallet.exists
            ? clampChips(Number((wallet.data() as { balance?: number }).balance) || 0)
            : 0;
          const payout = Math.floor(st.stake * mult * 100) / 100;
          const after = writeChips(tx, uid, balance + payout, now);
          tx.update(stakeRef, {
            cashedOut: true,
            cashoutMult: mult,
            cashoutAt: now,
            payout,
          });
          writePlay(
            tx,
            {
              uid,
              game: "crash",
              stake: 0,
              payout,
              balanceBefore: balance,
              balanceAfter: after,
              meta: { phase: "cashout", roundIndex: index, multiplier: mult },
            },
            now
          );
          return { ok: true, payout, stake: st.stake, balance: after };
        }
      );
      if (!out.ok) {
        return NextResponse.json({ error: out.error }, { status: out.status });
      }
      return NextResponse.json({
        ok: true,
        cashedOut: true,
        multiplier: mult,
        payout: out.payout,
        profit: Math.floor((out.payout - out.stake) * 100) / 100,
        balance: out.balance,
      });
    } catch (e) {
      console.error("[crash cashout]", e);
      return NextResponse.json({ error: "Cash out failed. Try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
