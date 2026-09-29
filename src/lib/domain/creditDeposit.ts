import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import { POINTS_PER_NAIRA } from "@/types/domain";
import type { Deposit, Wallet } from "@/types/domain";

/**
 * Idempotent credit after Flutterwave verify success.
 */
export async function creditVerifiedDeposit(input: {
  txRef: string;
  flwTransactionId: string;
  flwRef: string;
  amountNgn: number;
  currency: string;
}): Promise<{ credited: boolean; points: number; reason?: string }> {
  if (String(input.currency).toUpperCase() !== "NGN") {
    return { credited: false, points: 0, reason: "currency_not_ngn" };
  }

  const depositRef = adminDb.collection("deposits").doc(input.txRef);

  return adminDb.runTransaction(async (tx) => {
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

    // Round both sides — FLW may return floats
    const paid = Math.round(Number(input.amountNgn));
    const expected = Math.round(Number(deposit.amountNgn));
    if (paid !== expected) {
      return {
        credited: false,
        points: 0,
        reason: `amount_mismatch_${paid}_vs_${expected}`,
      };
    }

    const points = Math.round(expected * POINTS_PER_NAIRA);
    const walletRef = adminDb.collection("wallets").doc(deposit.uid);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) {
      return { credited: false, points: 0, reason: "wallet_missing" };
    }

    const before = normalizeWallet(walletSnap.data() as Wallet);
    const purchased = before.purchased + points;
    const balance = Math.max(
      0,
      purchased + before.promo - before.reservedStake - before.reservedWithdrawal
    );
    const now = Date.now();

    tx.update(walletRef, {
      purchased,
      promo: before.promo,
      reservedStake: before.reservedStake,
      reservedWithdrawal: before.reservedWithdrawal,
      balance,
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
        balanceAfter: balance,
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
      balanceAfter: balance,
      betId: null,
      status: "success",
      referenceId: input.txRef,
      createdAt: now,
    });

    return { credited: true, points };
  });
}
