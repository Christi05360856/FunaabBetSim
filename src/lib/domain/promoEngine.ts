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
  type Wallet,
} from "@/types/domain";
import { buildLedgerEntry, normalizeWallet } from "@/lib/domain/ledgerEngine";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Ensure default WELCOME100 exists (read phase). */
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

/** Load any promotion by code (doc id = CODE). */
export async function getPromotionByCode(
  db: Firestore,
  tx: Transaction,
  rawCode: string
): Promise<{ ref: DocumentReference; promo: Promotion; isNew: boolean } | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  if (code === WELCOME_PROMO_CODE) {
    const w = await getOrInitWelcomePromotion(db, tx);
    return { ref: w.ref, promo: w.promo, isNew: w.isNew };
  }
  const ref = db.collection("promotions").doc(code);
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  return { ref, promo: snap.data() as Promotion, isNew: false };
}

export async function hasRedeemedCode(
  db: Firestore,
  tx: Transaction,
  uid: string,
  code: string
): Promise<boolean> {
  const prior = await tx.get(
    db.collection("promo_redemptions").doc(`${uid}_${normalizeCode(code)}`)
  );
  return prior.exists;
}

/** @deprecated use hasRedeemedCode */
export async function hasRedeemedWelcome(
  db: Firestore,
  tx: Transaction,
  uid: string
): Promise<boolean> {
  return hasRedeemedCode(db, tx, uid, WELCOME_PROMO_CODE);
}

export function evaluatePromoEligibility(input: {
  promoCode: string | null;
  amountNgn: number;
  promo: Promotion;
  alreadyRedeemed: boolean;
}): { ok: boolean; reason?: string } {
  const code = normalizeCode(input.promoCode ?? "");
  if (!code) return { ok: false, reason: "no_code" };
  if (code !== normalizeCode(input.promo.code))
    return { ok: false, reason: "unknown_code" };
  const minDep = input.promo.minDepositNgn || MIN_DEPOSIT_NGN;
  if (input.amountNgn < minDep)
    return { ok: false, reason: "below_min_deposit" };
  if (
    !input.promo.active ||
    input.promo.redemptionCount >= input.promo.maxRedemptions
  )
    return { ok: false, reason: "exhausted" };
  if (input.alreadyRedeemed) return { ok: false, reason: "already_redeemed" };
  return { ok: true };
}

/** @deprecated use evaluatePromoEligibility */
export function evaluateWelcomeEligibility(input: {
  promoCode: string | null;
  amountNgn: number;
  promo: Promotion;
  alreadyRedeemed: boolean;
}): { ok: boolean; reason?: string } {
  return evaluatePromoEligibility(input);
}

export function writePromoCredit(
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
  const code = normalizeCode(input.promo.code);

  tx.update(db.collection("wallets").doc(input.uid), {
    promo: promoBal,
    balance,
    updatedAt: now,
  });

  if (input.isNewPromo) {
    tx.set(input.promoRef, {
      ...input.promo,
      redemptionCount: 1,
      updatedAt: now,
    });
  } else {
    const nextCount = input.promo.redemptionCount + 1;
    const exhausted =
      nextCount >= input.promo.maxRedemptions ? now : input.promo.exhaustedAt;
    tx.update(input.promoRef, {
      redemptionCount: nextCount,
      exhaustedAt: exhausted,
      active: nextCount < input.promo.maxRedemptions && input.promo.active,
      updatedAt: now,
    });
  }

  const redRef = db.collection("promo_redemptions").doc(`${input.uid}_${code}`);
  tx.set(redRef, {
    id: redRef.id,
    uid: input.uid,
    code,
    depositId: input.depositId,
    pointsCredited: points,
    createdAt: now,
  });

  const ledRef = db.collection("ledger").doc();
  tx.set(
    ledRef,
    buildLedgerEntry({
      id: ledRef.id,
      uid: input.uid,
      type: "PROMO_POINTS_CREDIT",
      amount: points,
      balanceBefore: w.balance,
      balanceAfter: balance,
      depositId: input.depositId,
      referenceId: code,
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
    referenceId: code,
    createdAt: now,
  });

  return points;
}

/** @deprecated use writePromoCredit */
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
  return writePromoCredit(db, tx, input);
  }
  
