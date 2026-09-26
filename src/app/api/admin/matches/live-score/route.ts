import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { resolveClinchedOverUnderWinners, resolveClinchedBTS } from "@/lib/domain/settlement";
import type { Bet, Match, MatchStatus, Market, Transaction, Wallet } from "@/types/domain";

const bodySchema = z.object({
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  /** Optional phase change while updating the interim score. */
  status: z.enum(["live", "halftime", "second_half"]).optional(),
});

const IN_PLAY: MatchStatus[] = ["live", "halftime", "second_half"];
const CAN_GO_LIVE: MatchStatus[] = ["open", "locked"];

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const { matchId, homeScore, awayScore, status: nextStatus } = parsed.data;
  const matchRef = adminDb.collection("matches").doc(matchId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists) throw new Error("Match not found");
      const match = snap.data() as Match;
      const current = match.status;

      // First time: allow open/locked → live. After that, only while already in-play.
      const alreadyInPlay = IN_PLAY.includes(current);
      const startingNow = CAN_GO_LIVE.includes(current) && (nextStatus === "live" || nextStatus === undefined);

      if (!alreadyInPlay && !startingNow) {
        throw new Error(`Cannot update live score — match is "${current}"`);
      }
      if (nextStatus && !IN_PLAY.includes(nextStatus)) {
        throw new Error("Invalid live status");
      }

      const now = Date.now();
      const update: Record<string, unknown> = {
        currentHomeScore: homeScore,
        currentAwayScore: awayScore,
        updatedAt: now,
      };
      if (startingNow && !alreadyInPlay) {
        update.status = nextStatus ?? "live";
      } else if (nextStatus && nextStatus !== current) {
        update.status = nextStatus;
      }
      tx.update(matchRef, update);

      // ---- Early-settle any bet whose outcome is already mathematically
      // locked in by this interim score (see resolveClinchedOverUnderWinners
      // / resolveClinchedBTS for exactly which ones qualify, and why). Every
      // other market — Match Winner, Double Chance, Draw No Bet, Correct
      // Score — is left alone; those can still change before full time.
      const totalGoals = homeScore + awayScore;
      const btsClinched = resolveClinchedBTS(homeScore, awayScore);

      const marketsSnap = await tx.get(
        adminDb.collection("markets").where("matchId", "==", matchId).where("status", "==", "active")
      );

      const clinchedSelectionIdsByMarket = new Map<string, string[]>();
      for (const marketDoc of marketsSnap.docs) {
        const market = marketDoc.data() as Market;
        if (market.type === "over_under") {
          const winners = resolveClinchedOverUnderWinners(totalGoals, market.selections.map((s) => s.id));
          if (winners.length > 0) clinchedSelectionIdsByMarket.set(market.id, winners);
        } else if (market.type === "both_teams_to_score" && btsClinched === "yes") {
          clinchedSelectionIdsByMarket.set(market.id, ["yes"]);
        }
      }

      if (clinchedSelectionIdsByMarket.size === 0) {
        return { ok: true, betsClinched: 0 };
      }

      const openBetsSnap = await tx.get(
        adminDb.collection("bets").where("matchId", "==", matchId).where("status", "==", "open")
      );
      const relevantBets = openBetsSnap.docs
        .map((d) => d.data() as Bet)
        .filter((bet) => clinchedSelectionIdsByMarket.has(bet.marketId));

      if (relevantBets.length === 0) {
        return { ok: true, betsClinched: 0 };
      }

      // Read wallets for every affected bettor up front (Firestore
      // transactions require all reads before any writes).
      const walletRefsByUid = new Map(
        relevantBets.map((bet) => [bet.uid, adminDb.collection("wallets").doc(bet.uid)] as const)
      );
      const walletSnaps = await Promise.all(Array.from(walletRefsByUid.values()).map((ref) => tx.get(ref)));
      const walletsByUid = new Map(
        Array.from(walletRefsByUid.keys()).map((uid, i) => [uid, walletSnaps[i]!.data() as Wallet])
      );

      let betsClinched = 0;
      for (const bet of relevantBets) {
        const winningIds = clinchedSelectionIdsByMarket.get(bet.marketId)!;
        // over_under's clinched list only ever contains "over_X" ids (see
        // resolveClinchedOverUnderWinners) — a bet on "under_X" for that
        // same line is therefore guaranteed lost the instant "over_X" is
        // clinched, since exactly one of the pair can ever win.
        const isPairedUnder = /^under_(\d+(?:\.\d+)?)$/.exec(bet.selectionId);
        const won = winningIds.includes(bet.selectionId);
        const lostByPairing = isPairedUnder && winningIds.includes(`over_${isPairedUnder[1]}`);
        const isBtsNo = bet.selectionId === "no" && winningIds.includes("yes");

        if (!won && !lostByPairing && !isBtsNo) continue; // not yet decided — leave open

        const betRef = adminDb.collection("bets").doc(bet.id);
        tx.update(betRef, { status: won ? "won" : "lost", settledAt: now });
        betsClinched++;

        if (won) {
          const wallet = walletsByUid.get(bet.uid)!;
          const newBalance = wallet.balance + bet.potentialPayout;
          tx.update(walletRefsByUid.get(bet.uid)!, {
            balance: newBalance,
            resetPendingSince: newBalance > 0 ? null : wallet.resetPendingSince,
            updatedAt: now,
          });
          const transactionRef = adminDb.collection("transactions").doc();
          const transaction: Transaction = {
            id: transactionRef.id,
            uid: bet.uid,
            type: "payout",
            amount: bet.potentialPayout,
            balanceAfter: newBalance,
            betId: bet.id,
            createdAt: now,
          };
          tx.set(transactionRef, transaction);
          walletsByUid.set(bet.uid, { ...wallet, balance: newBalance });
        }
      }

      return { ok: true, betsClinched };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update live score";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
