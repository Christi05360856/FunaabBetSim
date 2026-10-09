import "server-only";
import { adminDb } from "@/lib/firebase/admin";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export type PinReservation =
  | { ok: true }
  | { ok: false; lockedUntil: number };

/**
 * Counts a PIN attempt BEFORE the PIN is checked, inside a transaction.
 * Parallel requests are serialised, so an attacker cannot fire many guesses
 * at once and slip past the counter. The 5th attempt locks the PIN for 15 min.
 * Call clearPinAttempts() after a correct PIN.
 */
export async function reservePinAttempt(uid: string): Promise<PinReservation> {
  const ref = adminDb.collection("user_security").doc(uid);
  return adminDb.runTransaction(async (tx): Promise<PinReservation> => {
    const snap = await tx.get(ref);
    const d = (snap.data() ?? {}) as {
      pinFailCount?: number;
      pinLockedUntil?: number;
    };
    const now = Date.now();
    const lockedUntil = Number(d.pinLockedUntil ?? 0);
    if (lockedUntil > now) return { ok: false, lockedUntil };

    const attempts = Number(d.pinFailCount ?? 0) + 1;
    if (attempts >= MAX_FAILS) {
      tx.set(
        ref,
        { pinFailCount: 0, pinLockedUntil: now + LOCK_MS, updatedAt: now },
        { merge: true }
      );
    } else {
      tx.set(ref, { pinFailCount: attempts, updatedAt: now }, { merge: true });
    }
    return { ok: true };
  });
}

export async function clearPinAttempts(uid: string): Promise<void> {
  await adminDb
    .collection("user_security")
    .doc(uid)
    .set(
      { pinFailCount: 0, pinLockedUntil: 0, updatedAt: Date.now() },
      { merge: true }
    );
}
