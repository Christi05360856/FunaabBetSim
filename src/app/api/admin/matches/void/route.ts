import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { computeCredit } from "@/lib/domain/limits";
import {
  applyStakeLoss,
  applyStakeVoid,
  applyStakeWin,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import type { Bet, BetLeg, BetLegStatus, Match, Transaction, Wallet } from "@/types/domain";

const bodySchema = z.object({ matchId: z.string().min(1) });

function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel || "",
      odds: bet.oddsAtPlacement || 1,
    },
  ];
}

/**
 * Void a match:
 * - Single on this match → full stake refund (void)
 * - ACCA: this leg becomes void; remaining legs decide the ticket
 *   - any lost → lost
 *   - all void → full refund
 *   - all won, or won + void only → pay at product of non-void leg odds
 *   - still pending legs → stay open (leg statuses updated)
 */
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
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new Error("Match not found");
      const match = matchSnap.data() as Match;

      // Settled matches cannot be voided. Already-voided matches may still
      // need open ACCAs reconciled (e.g. first void ran before multi-leg fix).
      if (match.status === "settled") {
        return { alreadyFinal: true, betsHandled: 0 };
      }
      const alreadyVoided = match.status === "voided";

      const marketsSnap = await tx.get(
        adminDb.collection("markets").where("matchId", "==", matchId)
      );

      const openByMatchId = await tx.get(
        adminDb
          .collection("bets")
          .where("matchId", "==", matchId)
          .where("status", "==", "open")
      );
      const openByMatchIds = await tx.get(
        adminDb
          .collection("bets")
          .where("matchIds", "array-contains", matchId)
          .where("status", "==", "open")
      );

      const betMap = new Map<string, Bet>();
      for (const d of openByMatchId.docs) {
        betMap.set(d.id, { ...(d.data() as Bet), id: d.id });
      }
      for (const d of openByMatchIds.docs) {
        betMap.set(d.id, { ...(d.data() as Bet), id: d.id });
      }

      const uids = Array.from(new Set(Array.from(betMap.values()).map((b) => b.uid)));
      const walletRefs = new Map(
        uids.map((uid) => [uid, adminDb.collection("wallets").doc(uid)] as const)
      );
      const walletSnaps = await Promise.all(
        Array.from(walletRefs.values()).map((ref) => tx.get(ref))
      );
      const walletsByUid = new Map<string, Wallet | undefined>();
      uids.forEach((uid, i) => {
        const data = walletSnaps[i]?.data() as Wallet | undefined;
        walletsByUid.set(uid, data ? normalizeWallet(data) : undefined);
      });

      const now = Date.now();

      if (!alreadyVoided) {
        tx.update(matchRef, { status: "voided", updatedAt: now });
        for (const m of marketsSnap.docs) {
          tx.update(m.ref, { status: "disabled", updatedAt: now });
        }
      }

      let betsHandled = 0;

      for (const bet of betMap.values()) {
        const legs = betLegs(bet);
        const nextStatuses: BetLegStatus[] = legs.map((leg) => {
          if (leg.matchId === matchId) return "void";
          if (
            leg.status === "won" ||
            leg.status === "lost" ||
            leg.status === "void"
          ) {
            return leg.status;
          }
          return "pending";
        });

        const updatedLegs: BetLeg[] = legs.map((leg, i) => ({
          ...leg,
          status: nextStatuses[i],
        }));

        const anyLost = nextStatuses.some((s) => s === "lost");
        const anyPending = nextStatuses.some((s) => s === "pending");
        const allVoid =
          nextStatuses.length > 0 && nextStatuses.every((s) => s === "void");
        const allWon =
          nextStatuses.length > 0 && nextStatuses.every((s) => s === "won");
        const anyWon = nextStatuses.some((s) => s === "won");
        const anyVoid = nextStatuses.some((s) => s === "void");
        const winWithVoids =
          !anyLost &&
          !anyPending &&
          anyWon &&
          anyVoid &&
          nextStatuses.every((s) => s === "won" || s === "void");

        const betRef = adminDb.collection("bets").doc(bet.id);
        const wallet = walletsByUid.get(bet.uid);
        const split = {
          fromPurchased: bet.stakePurchased ?? bet.stake,
          fromPromo: bet.stakePromo ?? 0,
        };

        // Any lost leg → ticket lost
        if (anyLost) {
          if (wallet) {
            const before = normalizeWallet(wallet);
            const next = applyStakeLoss(before, bet.stake, split);
            tx.update(walletRefs.get(bet.uid)!, {
              purchased: next.purchased,
              promo: next.promo,
              reservedStake: next.reservedStake,
              reservedPromoStake: next.reservedPromoStake,
              reservedWithdrawal: next.reservedWithdrawal,
              balance: next.balance,
              resetPendingSince: null,
              updatedAt: now,
            });
            walletsByUid.set(bet.uid, next);
            const ledgerRef = adminDb.collection("ledger").doc();
            tx.set(
              ledgerRef,
              buildLedgerEntry({
                id: ledgerRef.id,
                uid: bet.uid,
                type: "BET_LOSS_SETTLEMENT",
                amount: -bet.stake,
                balanceBefore: before.balance,
                balanceAfter: next.balance,
                betId: bet.id,
                metadata: { ...split, via: "void_match" },
                now,
              })
            );
            const transactionRef = adminDb.collection("transactions").doc();
            const transaction: Transaction = {
              id: transactionRef.id,
              uid: bet.uid,
              type: "debit_bet",
              amount: -bet.stake,
              balanceAfter: next.balance,
              balanceBefore: before.balance,
              betId: bet.id,
              status: "success",
              createdAt: now,
            };
            tx.set(transactionRef, transaction);
          }
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
            status: "lost",
            settledAt: now,
          });
          betsHandled++;
          continue;
        }

        // All legs void → full stake refund
        if (allVoid) {
          if (wallet) {
            const before = normalizeWallet(wallet);
            const next = applyStakeVoid(before, bet.stake, bet.stakePromo ?? 0);
            tx.update(walletRefs.get(bet.uid)!, {
              purchased: next.purchased,
              promo: next.promo,
              reservedStake: next.reservedStake,
              reservedPromoStake: next.reservedPromoStake,
              reservedWithdrawal: next.reservedWithdrawal,
              balance: next.balance,
              resetPendingSince: null,
              updatedAt: now,
            });
            walletsByUid.set(bet.uid, next);
            const ledgerRef = adminDb.collection("ledger").doc();
            tx.set(
              ledgerRef,
              buildLedgerEntry({
                id: ledgerRef.id,
                uid: bet.uid,
                type: "BET_VOID_REFUND",
                amount: bet.stake,
                balanceBefore: before.balance,
                balanceAfter: next.balance,
                betId: bet.id,
                metadata: { via: "void_match" },
                now,
              })
            );
            const transactionRef = adminDb.collection("transactions").doc();
            const transaction: Transaction = {
              id: transactionRef.id,
              uid: bet.uid,
              type: "refund",
              amount: bet.stake,
              balanceAfter: next.balance,
              balanceBefore: before.balance,
              betId: bet.id,
              status: "success",
              createdAt: now,
            };
            tx.set(transactionRef, transaction);
          }
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
            status: "void",
            settledAt: now,
          });
          betsHandled++;
          continue;
        }

        // Won + void only (no pending/loss) → pay at product of non-void odds
        // Example: 2-leg ACCA, leg1 won @2.02, leg2 void → payout = stake * 2.02
        if (allWon || winWithVoids) {
          let payout = bet.potentialPayout;
          if (winWithVoids && !allWon) {
            const mult = legs.reduce((acc, leg, i) => {
              if (nextStatuses[i] === "void") return acc;
              return acc * (Number(leg.odds) || 1);
            }, 1);
            payout = computeCredit(bet.stake, mult, bet.snr ? (bet.stakePromo ?? 0) : 0);
          }
          if (wallet) {
            const before = normalizeWallet(wallet);
            const next = applyStakeWin(before, bet.stake, payout, split);
            tx.update(walletRefs.get(bet.uid)!, {
              purchased: next.purchased,
              promo: next.promo,
              reservedStake: next.reservedStake,
              reservedPromoStake: next.reservedPromoStake,
              reservedWithdrawal: next.reservedWithdrawal,
              balance: next.balance,
              resetPendingSince: null,
              updatedAt: now,
            });
            walletsByUid.set(bet.uid, next);
            const ledgerRef = adminDb.collection("ledger").doc();
            tx.set(
              ledgerRef,
              buildLedgerEntry({
                id: ledgerRef.id,
                uid: bet.uid,
                type: "BET_WIN_SETTLEMENT",
                amount: payout,
                balanceBefore: before.balance,
                balanceAfter: next.balance,
                betId: bet.id,
                metadata: {
                  ...split,
                  via: "void_match",
                  winWithVoids: true,
                  payout,
                },
                now,
              })
            );
            const transactionRef = adminDb.collection("transactions").doc();
            const transaction: Transaction = {
              id: transactionRef.id,
              uid: bet.uid,
              type: "payout",
              amount: payout,
              balanceAfter: next.balance,
              balanceBefore: before.balance,
              betId: bet.id,
              status: "success",
              createdAt: now,
            };
            tx.set(transactionRef, transaction);
          }
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
            status: "won",
            settledAt: now,
            payout,
          });
          betsHandled++;
          continue;
        }

        // Still has pending legs → keep OPEN, only mark this leg void
        tx.update(betRef, {
          legs: updatedLegs,
          matchIds: legs.map((l) => l.matchId),
        });
        betsHandled++;
      }

      return { alreadyFinal: alreadyVoided, betsHandled, reconciled: alreadyVoided };
    });

    revalidateTag("fixtures-core");
    revalidateTag("markets");

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not void match";
    return NextResponse.json({ error: message }, { status: 400 });
  }
              }


                
