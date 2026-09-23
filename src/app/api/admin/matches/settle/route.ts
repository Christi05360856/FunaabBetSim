import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { confirmResultSchema } from "@/lib/validation/schemas";
import { resolveMatchWinnerSelectionId } from "@/lib/domain/settlement";
import type { Bet, Match, Market, Transaction, Wallet } from "@/types/domain";

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = confirmResultSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { matchId, homeScore, awayScore } = parsed.data;

  const matchRef = adminDb.collection("matches").doc(matchId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // ---- Reads (all of them, before any write) --------------------------
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new Error("Match not found");
      const match = matchSnap.data() as Match;

      // Idempotency guard (spec §16): if this match has already been
      // settled, running this again must be a safe no-op, not a double-pay.
      if (match.status === "settled") {
        return { alreadySettled: true, betsSettled: 0 };
      }
      if (match.status === "postponed" || match.status === "voided") {
        throw new Error(`Cannot settle — match is ${match.status}`);
      }

      const marketSnap = await tx.get(
        adminDb.collection("markets").where("matchId", "==", matchId).where("type", "==", "match_winner").limit(1)
      );
      if (marketSnap.empty) throw new Error("No Match Winner market found for this match");
      const marketDoc = marketSnap.docs[0]!;
      const market = marketDoc.data() as Market;

      const openBetsSnap = await tx.get(
        adminDb.collection("bets").where("matchId", "==", matchId).where("status", "==", "open")
      );

      const winningSelectionId = resolveMatchWinnerSelectionId(homeScore, awayScore);

      // For each winning bet we'll need to read (and later update) that
      // bettor's wallet — a second round of reads, still before any writes.
      const winningBets = openBetsSnap.docs.filter(
        (d) => (d.data() as Bet).selectionId === winningSelectionId
      );
      const walletRefsByUid = new Map(
        winningBets.map((d) => {
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

      // ---- Writes (only after every read above has completed) -------------
      const now = Date.now();

      tx.update(matchRef, { status: "settled", homeScore, awayScore, updatedAt: now });
      tx.update(marketDoc.ref, { status: "settled", updatedAt: now });

      for (const betDoc of openBetsSnap.docs) {
        const bet = betDoc.data() as Bet;
        const won = bet.selectionId === winningSelectionId;

        tx.update(betDoc.ref, {
          status: won ? "won" : "lost",
          settledAt: now,
        });

        if (won) {
          const wallet = walletsByUid.get(bet.uid)!;
          const newBalance = wallet.balance + bet.potentialPayout;

          tx.update(walletRefsByUid.get(bet.uid)!, {
            balance: newBalance,
            // A payout that brings the balance back above zero cancels any
            // in-progress reset cooldown — the wallet isn't empty anymore.
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

          // Keep this bet's own record consistent even if the wallet
          // receives multiple payouts in the same transaction.
          walletsByUid.set(bet.uid, { ...wallet, balance: newBalance });
        }
      }

      return { alreadySettled: false, betsSettled: openBetsSnap.size };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not settle match";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
