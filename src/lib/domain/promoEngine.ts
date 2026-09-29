import "server-only";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import {
  WELCOME_BONUS_POINTS,
  WELCOME_MAX_REDEMPTIONS,
  WELCOME_PROMO_CODE,
  MIN_DEPOSIT_NGN,
  type Promotion,
  type PromoRedemption,
  type Wallet,
} from "@/types/domain";
import { buildLedgerEntry, normalizeWallet } from "@/lib/domain/ledgerEngine";

/** Load or create WELCOME100 (read phase of a transaction). */
export async function getOrInitWelcomePromotion(
  db: Firestore,
  tx: Transaction
): Promise<{ ref: DocumentReference; promo: Promotion; isNew: boolean }> {
  const ref = db.collection("promotions").doc(WELCOME_PROMO_CODE);
  const snap = await tx.get(ref);
  const now = Date.now();
  if (snap.exists) {
    return { ref, promo: snap.data() as Promotion, isNew: false };
  }
  const promo: Promotion = {
    id: WELCOME_PROMO_CODE,
    code: WELCOME_PROMO_CODE,
    ruleType: "welcome_fixed",
    bonusPoints: WELCOME_BONUS_POINTS,
    minDepositNgn: MIN_DEPOSIT_NGN,
    maxRedemptions: WELCOME_MAX_REDEMPTIONS,
    redemptionCount: 0,
    active: true,
    exhaustedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return { ref, promo, isNew: true };
}

export async function hasRedeemedWelcome(
  db: Firestore,
  tx: Transaction,
  uid: string
): Promise<boolean> {
  // Deterministic id avoids composite index: {uid}_{code}
  const prior = await tx.get(
    db.collection("promo_redemptions").doc(`${uid}_${WELCOME_PROMO_CODE}`)
  );
  return prior.exists;
}

export function evaluateWelcomeEligibility(input: {
  promoCode: string | null;
  amountNgn: number;
  promo: Promotion;
  alreadyRedeemed: boolean;
}): { ok: boolean; reason?: string } {
  const code = (input.promoCode ?? "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "no_code" };
  if (code !== WELCOME_PROMO_CODE) return { ok: false, reason: "unknown_code" };
  if (input.amountNgn < MIN_DEPOSIT_NGN)
    return { ok: false, reason: "below_min_deposit" };
  if (
    !input.promo.active ||
    input.promo.redemptionCount >= input.promo.maxRedemptions
  )
    return { ok: false, reason: "exhausted" };
  if (input.alreadyRedeemed) return { ok: false, reason: "already_redeemed" };
  return { ok: true };
}

/** Write promo credit (after all reads). */
export function writeWelcomePromoCredit(
  db: Firestore,
  tx: Transaction,
  input: {
    uid: string;
    depositId: string;
    promo: Promotion;
    promoRef: DocumentReference;
    isNewPromo: boolean;
    walletAfterPurchase: Wallet;
  }
): number {
  const points = input.promo.bonusPoints;
  const now = Date.now();
  const w = normalizeWallet(input.walletAfterPurchase);
  const promoBal = w.promo + points;
  const balance = Math.max(
    0,
    w.purchased + promoBal - w.reservedStake - w.reservedWithdrawal
  );

  tx.update(db.collection("wallets").doc(input.uid), {
    promo: promoBal,
    balance,
    updatedAt: now,
  });

  const nextCount = input.promo.redemptionCount + 1;
  const exhausted = nextCount >= input.promo.maxRedemptions;
  const nextPromo: Promotion = {
    ...input.promo,
    redemptionCount: nextCount,
    active: !exhausted,
    exhaustedAt: exhausted ? now : null,
    updatedAt: now,
  };
  tx.set(input.promoRef, nextPromo);

  const redRef = db
    .collection("promo_redemptions")
    .doc(`${input.uid}_${WELCOME_PROMO_CODE}`);
  const redemption: PromoRedemption = {
    id: redRef.id,
    uid: input.uid,
    code: WELCOME_PROMO_CODE,
    depositId: input.depositId,
    pointsCredited: points,
    createdAt: now,
  };
  tx.set(redRef, redemption);

  const ledgerRef = db.collection("ledger").doc();
  tx.set(
    ledgerRef,
    buildLedgerEntry({
      id: ledgerRef.id,
      uid: input.uid,
      type: "PROMO_POINTS_CREDIT",
      amount: points,
      balanceBefore: w.balance,
      balanceAfter: balance,
      depositId: input.depositId,
      referenceId: WELCOME_PROMO_CODE,
      metadata: { code: WELCOME_PROMO_CODE },
      now,
    })
  );

  const trRef = db.collection("transactions").doc();
  tx.set(trRef, {
    id: trRef.id,
    uid: input.uid,
    type: "PROMO_POINTS_CREDIT",
    amount: points,
    balanceBefore: w.balance,
    balanceAfter: balance,
    betId: null,
    status: "success",
    referenceId: WELCOME_PROMO_CODE,
    createdAt: now,
  });

  return points;
}
