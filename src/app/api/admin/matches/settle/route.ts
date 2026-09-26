import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { confirmResultSchema } from "@/lib/validation/schemas";
import {
  resolveMatchWinnerSelectionId,
  resolveDoubleChanceSelectionIds,
  resolveDrawNoBetSelectionId,
  resolveOverUnderSelectionId,
  resolveBTSSelectionId,
  resolveCorrectScoreOutcome,
} from "@/lib/domain/settlement";
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
      // ---- Reads ----------------------------------------------------------
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new Error("Match not found");
      const match = matchSnap.data() as Match;

      if (match.status === "settled") {
        return { alreadySettled: true, betsSettled: 0 };
      }
      if (match.status === "postponed" || match.status === "voided") {
        throw new Error(`Cannot settle — match is ${match.status}`);
      }

      // Get ALL markets for this match
      const marketsSnap = await tx.get(
        adminDb.collection("markets").where("matchId", "==", matchId)
      );

      const openBetsSnap = await tx.get(
        adminDb.collection("bets").where("matchId", "==", matchId).where("status", "==", "open")
      );

      // Group bets by market
      const betsByMarket = new Map<string, Bet[]>();
      for (const betDoc of openBetsSnap.docs) {
        const bet = betDoc.data() as Bet;
        if (!betsByMarket.has(bet.marketId)) betsByMarket.set(bet.marketId, []);
        betsByMarket.get(bet.marketId)!.push(bet);
      }

      // Read wallets for all bettors
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

      // ---- Writes ---------------------------------------------------------
      const now = Date.now();

      tx.update(matchRef, { status: "settled", homeScore, awayScore, updatedAt: now });

      let betsSettled = 0;

      // Settle each market
      for (const marketDoc of marketsSnap.docs) {
        const market = marketDoc.data() as Market;
        tx.update(marketDoc.ref, { status: "settled", updatedAt: now });

        const marketBets = betsByMarket.get(market.id) ?? [];
        if (marketBets.length === 0) continue;

        // Determine winning selection(s) based on market type. Most markets
        // have exactly one winning selection, but Double Chance always has
        // two (e.g. a home win pays both "1X" and "12"), hence an array.
        let winningSelectionIds: string[] | null = null;
        let isRefund = false;

        switch (market.type) {
          case "match_winner":
            winningSelectionIds = [resolveMatchWinnerSelectionId(homeScore, awayScore)];
            break;
          case "double_chance":
            winningSelectionIds = resolveDoubleChanceSelectionIds(homeScore, awayScore);
            break;
          case "draw_no_bet": {
            const result = resolveDrawNoBetSelectionId(homeScore, awayScore);
            if (result === "refund") {
              isRefund = true;
            } else {
              winningSelectionIds = [result];
            }
            break;
          }
          case "over_under": {
            const line = (market as any).line ?? 2.5;
            winningSelectionIds = [resolveOverUnderSelectionId(homeScore, awayScore, line)];
            break;
          }
          case "both_teams_to_score":
            winningSelectionIds = [resolveBTSSelectionId(homeScore, awayScore)];
            break;
          case "correct_score": {
            const { exactId, otherBucketId } = resolveCorrectScoreOutcome(homeScore, awayScore);
            const exactWasOffered = market.selections.some((s) => s.id === exactId);
            winningSelectionIds = [exactWasOffered ? exactId : otherBucketId];
            break;
          }
          default:
            continue; // Skip unknown market types
        }

        // Settle bets for this market
        for (const bet of marketBets) {
          const betRef = adminDb.collection("bets").doc(bet.id);
          
          if (isRefund) {
            // Refund the stake
            tx.update(betRef, { status: "void", settledAt: now });
            
            const wallet = walletsByUid.get(bet.uid)!;
            const newBalance = wallet.balance + bet.stake;

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
          } else {
            const won = winningSelectionIds?.includes(bet.selectionId) ?? false;
            tx.update(betRef, { status: won ? "won" : "lost", settledAt: now });

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
          betsSettled++;
        }
      }

      return { alreadySettled: false, betsSettled };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not settle match";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
