import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { placeBetSchema } from "@/lib/validation/schemas";
import { canPlaceStake } from "@/lib/domain/wallet";
import type { Bet, Market, Match, Transaction, Wallet } from "@/types/domain";

export async function POST(request: NextRequest) {
  // 1. User is authenticated (spec §12 rule 1)
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = decoded.uid;

  const parsed = placeBetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { matchId, marketId, selectionId, stake } = parsed.data;

  const walletRef = adminDb.collection("wallets").doc(uid);
  const matchRef = adminDb.collection("matches").doc(matchId);
  const marketRef = adminDb.collection("markets").doc(marketId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // All reads must happen before any writes inside a Firestore transaction.
      const [walletSnap, matchSnap, marketSnap] = await Promise.all([
        tx.get(walletRef),
        tx.get(matchRef),
        tx.get(marketRef),
      ]);

      if (!walletSnap.exists) throw new Error("Wallet not found");
      const wallet = walletSnap.data() as Wallet;

      // 3–4. Match exists and is open (spec §12 rules 3–4, 10)
      if (!matchSnap.exists) throw new Error("Match not found");
      const match = matchSnap.data() as Match;
      if (match.status !== "open") {
        throw new Error("Betting is not open for this match");
      }

      // 5–6, 9. Market exists, is active, and actually belongs to this match
      if (!marketSnap.exists) throw new Error("Market not found");
      const market = marketSnap.data() as Market;
      if (market.status !== "active") throw new Error("This market is not active");
      if (market.matchId !== matchId) throw new Error("Market does not belong to this match");

      // 7–8. Selection exists and belongs to this market
      const selection = market.selections.find((s) => s.id === selectionId);
      if (!selection) throw new Error("Selection not found on this market");

      // 11–12. Stake meets the minimum and does not exceed the balance
      if (!canPlaceStake(wallet.balance, stake)) {
        throw new Error("Invalid stake for your current balance");
      }

      // ---- All checks passed — capture odds now, before any write --------
      const now = Date.now();
      const oddsAtPlacement = selection.odds;
      const potentialPayout = Math.round(stake * oddsAtPlacement);
      const newBalance = wallet.balance - stake;

      const betRef = adminDb.collection("bets").doc();
      const bet: Bet = {
        id: betRef.id,
        uid,
        matchId,
        marketId,
        selectionId,
        selectionLabel: selection.label,
        oddsAtPlacement,
        stake,
        potentialPayout,
        status: "open",
        placedAt: now,
        settledAt: null,
      };

      const transactionRef = adminDb.collection("transactions").doc();
      const transaction: Transaction = {
        id: transactionRef.id,
        uid,
        type: "debit_bet",
        amount: -stake,
        balanceAfter: newBalance,
        betId: betRef.id,
        createdAt: now,
      };

      // ---- Writes — all committed together, or none of them are ----------
        tx.update(walletRef, {
        balance: newBalance,
        lifetimeWagering: wallet.lifetimeWagering + stake,
        // Start the reset cooldown the moment the balance hits exactly zero.
        // Only set it if it isn't already running — don't restart an
        // existing countdown just because another bet also landed on zero.
        resetPendingSince:
          newBalance === 0 && wallet.resetPendingSince === null ? now : wallet.resetPendingSince,
        updatedAt: now,
      });
      tx.set(betRef, bet);
      tx.set(transactionRef, transaction);

      return { betId: betRef.id, balance: newBalance, potentialPayout };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not place bet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
