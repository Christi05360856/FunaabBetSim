import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import {
  evaluateWelcomeEligibility,
  getOrInitWelcomePromotion,
  hasRedeemedWelcome,
  writeWelcomePromoCredit,
} from "@/lib/domain/promoEngine";
import { POINTS_PER_NAIRA } from "@/types/domain";
import type { Deposit, Wallet } from "@/types/domain";

/**
 * Idempotent credit after Flutterwave verify success.
 * Applies welcome promo in the same transaction when eligible.
 */
export async function creditVerifiedDeposit(input: {
  txRef: string;
  flwTransactionId: string;
  flwRef: string;
  amountNgn: number;
  currency: string;
}): Promise<{
  credited: boolean;
  points: number;
  promoPoints?: number;
  reason?: string;
}> {
  if (String(input.currency).toUpperCase() !== "NGN") {
    return { credited: false, points: 0, reason: "currency_not_ngn" };
  }

  const depositRef = adminDb.collection("deposits").doc(input.txRef);

  return adminDb.runTransaction(async (tx) => {
    // ---- ALL READS FIRST ----
    const depSnap = await tx.get(depositRef);
    if (!depSnap.exists) {
      return { credited: false, points: 0, reason: "deposit_not_found" };
    }
    const deposit = depSnap.data() as Deposit;

    if (deposit.status === "success") {
      return {
        credited: false,
        points: deposit.points,
        reason: "already_credited",
      };
    }
    if (deposit.status !== "initiated" && deposit.status !== "pending") {
      return { credited: false, points: 0, reason: `status_${deposit.status}` };
    }

    const paid = Math.round(Number(input.amountNgn));
    const expected = Math.round(Number(deposit.amountNgn));
    if (paid !== expected) {
      return {
        credited: false,
        points: 0,
        reason: `amount_mismatch_${paid}_vs_${expected}`,
      };
    }

    const walletRef = adminDb.collection("wallets").doc(deposit.uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) {
      return { credited: false, points: 0, reason: "wallet_missing" };
    }

    const { ref: promoRef, promo, isNew } = await getOrInitWelcomePromotion(
      adminDb,
      tx
    );
    const alreadyRedeemed = await hasRedeemedWelcome(
      adminDb,
      tx,
      deposit.uid
    );

    // ---- WRITES ----
    const points = Math.round(expected * POINTS_PER_NAIRA);
    const before = normalizeWallet(walletSnap.data() as Wallet);
    const purchased = before.purchased + points;
    const balanceAfterPurchase = Math.max(
      0,
      purchased + before.promo - before.reservedStake - before.reservedWithdrawal
    );
    const now = Date.now();

    tx.update(walletRef, {
      purchased,
      promo: before.promo,
      reservedStake: before.reservedStake,
      reservedWithdrawal: before.reservedWithdrawal,
      balance: balanceAfterPurchase,
      resetPendingSince: null,
      updatedAt: now,
    });

    tx.update(depositRef, {
      status: "success",
      points,
      flwTransactionId: input.flwTransactionId,
      flwRef: input.flwRef,
      completedAt: now,
    });

    const ledgerRef = adminDb.collection("ledger").doc();
    tx.set(
      ledgerRef,
      buildLedgerEntry({
        id: ledgerRef.id,
        uid: deposit.uid,
        type: "PURCHASED_POINTS_CREDIT",
        amount: points,
        balanceBefore: before.balance,
        balanceAfter: balanceAfterPurchase,
        depositId: deposit.id,
        referenceId: input.txRef,
        metadata: {
          flwTransactionId: input.flwTransactionId,
          flwRef: input.flwRef,
          amountNgn: expected,
        },
        now,
      })
    );

    const trRef = adminDb.collection("transactions").doc();
    tx.set(trRef, {
      id: trRef.id,
      uid: deposit.uid,
      type: "PURCHASED_POINTS_CREDIT",
      amount: points,
      balanceBefore: before.balance,
      balanceAfter: balanceAfterPurchase,
      betId: null,
      status: "success",
      referenceId: input.txRef,
      createdAt: now,
    });

    const eligibility = evaluateWelcomeEligibility({
      promoCode: deposit.promoCode,
      amountNgn: expected,
      promo,
      alreadyRedeemed,
    });

    let promoPoints = 0;
    if (eligibility.ok) {
      promoPoints = writeWelcomePromoCredit(adminDb, tx, {
        uid: deposit.uid,
        depositId: deposit.id,
        promo,
        promoRef,
        isNewPromo: isNew,
        walletAfterPurchase: {
          ...before,
          purchased,
          balance: balanceAfterPurchase,
        },
      });
    }

    return {
      credited: true,
      points,
      promoPoints,
      reason: eligibility.ok ? undefined : eligibility.reason,
    };
  });
}
