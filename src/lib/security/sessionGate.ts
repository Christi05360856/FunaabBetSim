import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";

/** How fresh the sign-in must be for withdrawals (seconds). Override with WITHDRAW_AUTH_MAX_AGE_SEC. */
export function withdrawAuthMaxAgeSec(): number {
  const n = Number(process.env.WITHDRAW_AUTH_MAX_AGE_SEC);
  return Number.isFinite(n) && n >= 60 ? n : 30 * 60; // 30 minutes
}

/** Minimum account age before first withdrawal (ms). Override with WITHDRAW_MIN_ACCOUNT_AGE_MS. */
export function withdrawMinAccountAgeMs(): number {
  const n = Number(process.env.WITHDRAW_MIN_ACCOUNT_AGE_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60 * 60 * 1000; // 1 hour
}

/**
 * Require a recent interactive sign-in (auth_time on the ID token).
 * Blocks stolen long-lived sessions from draining wallets immediately.
 */
export function requireRecentAuth(
  decoded: DecodedIdToken,
  maxAgeSec = withdrawAuthMaxAgeSec()
): { ok: true } | { ok: false; error: string } {
  const authTime = Number(decoded.auth_time);
  if (!Number.isFinite(authTime) || authTime <= 0) {
    return {
      ok: false,
      error: "Session invalid. Sign out and sign in again, then retry withdrawal.",
    };
  }
  const ageSec = Math.floor(Date.now() / 1000) - authTime;
  if (ageSec > maxAgeSec) {
    const mins = Math.ceil(maxAgeSec / 60);
    return {
      ok: false,
      error: `For your security, sign out and sign in again before withdrawing (session older than ${mins} minutes).`,
    };
  }
  return { ok: true };
}

/**
 * New accounts cannot withdraw instantly (slows multi-account drain bots).
 */
export async function requireAccountAge(
  uid: string,
  minAgeMs = withdrawMinAccountAgeMs()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (minAgeMs <= 0) return { ok: true };

  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return { ok: false, error: "Profile not found. Complete registration first." };
  }
  const createdAt = Number((userSnap.data() as { createdAt?: number }).createdAt);
  if (!Number.isFinite(createdAt)) {
    return { ok: true }; // legacy profiles without createdAt
  }
  const age = Date.now() - createdAt;
  if (age < minAgeMs) {
    const waitMin = Math.ceil((minAgeMs - age) / 60000);
    return {
      ok: false,
      error: `New accounts can withdraw after a short wait. Try again in about ${waitMin} minute(s).`,
    };
  }
  return { ok: true };
}

/** Normalize account name for comparison (letters only). */
export function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * If user already has a non-rejected withdrawal, new requests must use the same
 * bank account (stops attacker changing payout destination after takeover).
 */
export async function requireStablePayoutDestination(
  uid: string,
  bankCode: string,
  accountNumber: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const snap = await adminDb
    .collection("withdrawals")
    .where("uid", "==", uid)
    .limit(30)
    .get();

  let lockedCode: string | null = null;
  let lockedAcct: string | null = null;

  snap.forEach((doc) => {
    const w = doc.data() as {
      status?: string;
      bankCode?: string;
      accountNumber?: string;
    };
    if (w.status === "rejected" || w.status === "payment_failed") return;
    if (w.bankCode && w.accountNumber) {
      lockedCode = String(w.bankCode);
      lockedAcct = String(w.accountNumber);
    }
  });

  if (!lockedCode || !lockedAcct) return { ok: true };

  if (lockedCode !== bankCode || lockedAcct !== accountNumber) {
    return {
      ok: false,
      error:
        "Payout bank is locked to your previous withdrawal account. Contact support to change it.",
    };
  }
  return { ok: true };
}
