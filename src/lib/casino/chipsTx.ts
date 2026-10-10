import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { CASINO_START_CHIPS } from "@/types/casino";

/**
 * Demo-chip helpers that run INSIDE a Firestore transaction, so a stake, a
 * game record and a payout can be written together or not at all.
 * Rule for callers: do all tx.get() reads first, then the writes.
 */

const WALLETS = "casino_wallets";
export const PLAYS = "casino_plays";

export function clampChips(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n * 100) / 100;
}

export function chipsRef(uid: string) {
  return adminDb.collection(WALLETS).doc(uid);
}

export function newPlayRef() {
  return adminDb.collection(PLAYS).doc();
}

/** Current chips (new players start with the free starting chips). */
export async function readChips(tx: Transaction, uid: string): Promise<number> {
  const snap = await tx.get(chipsRef(uid));
  if (!snap.exists) return CASINO_START_CHIPS;
  const bal = Number((snap.data() as { balance?: number }).balance) || 0;
  return clampChips(bal);
}

export function writeChips(
  tx: Transaction,
  uid: string,
  balance: number,
  now: number = Date.now()
): number {
  const next = clampChips(balance);
  tx.set(
    chipsRef(uid),
    { uid, balance: next, updatedAt: now },
    { merge: true }
  );
  return next;
}

/** One row in the player's casino history. */
export function writePlay(
  tx: Transaction,
  input: {
    uid: string;
    game: string;
    stake: number;
    payout: number;
    balanceBefore: number;
    balanceAfter: number;
    meta: Record<string, unknown>;
  },
  now: number = Date.now()
): void {
  const ref = newPlayRef();
  tx.set(ref, {
    id: ref.id,
    uid: input.uid,
    game: input.game,
    stake: clampChips(input.stake),
    payout: clampChips(input.payout),
    profit: Math.floor((input.payout - input.stake) * 100) / 100,
    balanceBefore: input.balanceBefore,
    balanceAfter: input.balanceAfter,
    meta: input.meta,
    createdAt: now,
  });
}
