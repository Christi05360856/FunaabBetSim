import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Bet, Match, Transaction, Wallet } from "@/types/domain";

const bodySchema = z.object({ matchId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { matchId } = parsed.data;
  const matchRef = adminDb.collection("matches").doc(matchId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // ---- Reads ------------------------------------------------------------
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new Error("Match not found");
      const match = matchSnap.data() as Match;

      // Idempotency (same pattern as settlement): already-final states can't
      // be voided after the fact.
      if (match.status === "settled" || match.status === "voided") {
        return { alreadyFinal: true, betsRefunded: 0 };
      }

      const marketSnap = await tx.get(
        adminDb.collection("markets").where("matchId", "==", matchId).where("type", "==", "match_winner").limit(1)
      );

      const openBetsSnap = await tx.get(
        adminDb.collection("bets").where("matchId", "==", matchId).where("status", "==", "open")
      );

      const walletRefsByUid = new Map(
        openBetsSnap.docs.map((d) => {
          const uid = (d.data() as Bet).uid;
          return [uid, adminDb.collection("wallets").doc(uid)] as const;
        })
      );
      const walletSnaps = await Promise.all(
        Array.from(walletRefsByUid.values()).map((ref) => tx.get(ref))
      );
      const walletsByUid = new Map(
        Array.from(walletRefsByUid.keys()).map((uid, i) => [uid, walletSnaps[i]!.data() as Wallet])
      );

      // ---- Writes -------------------------------------------------------------
      const now = Date.now();

      tx.update(matchRef, { status: "voided", updatedAt: now });
      if (!marketSnap.empty) {
        tx.update(marketSnap.docs[0]!.ref, { status: "disabled", updatedAt: now });
      }

      for (const betDoc of openBetsSnap.docs) {
        const bet = betDoc.data() as Bet;
        tx.update(betDoc.ref, { status: "void", settledAt: now });

        const wallet = walletsByUid.get(bet.uid)!;
        const newBalance = wallet.balance + bet.stake; // refund stake only, not potentialPayout

        tx.update(walletRefsByUid.get(bet.uid)!, {
          balance: newBalance,
          resetPendingSince: newBalance > 0 ? null : wallet.resetPendingSince,
          updatedAt: now,
        });

        const transactionRef = adminDb.collection("transactions").doc();
        const transaction: Transaction = {
          id: transactionRef.id,
          uid: bet.uid,
          type: "refund",
          amount: bet.stake,
          balanceAfter: newBalance,
          betId: bet.id,
          createdAt: now,
        };
        tx.set(transactionRef, transaction);

        walletsByUid.set(bet.uid, { ...wallet, balance: newBalance });
      }

      return { alreadyFinal: false, betsRefunded: openBetsSnap.size };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not void match";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
