import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ageGateEnforced, depositsEnabled } from "@/lib/config/features";
import {
  checkDepositAgainstLimits,
  isExcluded,
  type DepositRecord,
  type SafePlayState,
} from "@/lib/compliance/safePlay";

export type ComplianceDoc = SafePlayState & {
  dob?: string | null;
  ageVerifiedAt?: number | null;
  underageAttemptAt?: number | null;
};

export type GateResult =
  | { ok: true }
  | { ok: false; error: string; code: string; status: number };

export async function loadCompliance(uid: string): Promise<ComplianceDoc> {
  const snap = await adminDb.collection("compliance").doc(uid).get();
  return (snap.exists ? snap.data() : {}) as ComplianceDoc;
}

export function isAgeVerified(doc: ComplianceDoc): boolean {
  return Boolean(doc.dob && doc.ageVerifiedAt);
}

function adultCheck(doc: ComplianceDoc): GateResult {
  if (!ageGateEnforced()) return { ok: true };
  if (isAgeVerified(doc)) return { ok: true };
  return {
    ok: false,
    error: "Confirm your date of birth under Account → Settings → Safer play before you continue (18+ only).",
    code: "age_required",
    status: 403,
  };
}

function exclusionCheck(doc: ComplianceDoc, now: number): GateResult {
  if (!isExcluded(doc, now)) return { ok: true };
  const until = new Date(Number(doc.exclusionUntil)).toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return {
    ok: false,
    error: `You are taking a break until ${until}. Betting and deposits are paused. You can still withdraw.`,
    code: "self_excluded",
    status: 403,
  };
}

/** Must be 18+ (confirmed) and not on a break. Used before placing bets. */
export async function requirePlayAllowed(uid: string): Promise<GateResult> {
  const doc = await loadCompliance(uid);
  const adult = adultCheck(doc);
  if (!adult.ok) return adult;
  return exclusionCheck(doc, Date.now());
}

/** Must be 18+ (confirmed). Used before KYC. */
export async function requireAdult(uid: string): Promise<GateResult> {
  return adultCheck(await loadCompliance(uid));
}

/** Recent successful deposits, plus ones started in the last hour. */
export async function recentDeposits(uid: string): Promise<DepositRecord[]> {
  const snap = await adminDb
    .collection("deposits")
    .where("uid", "==", uid)
    .limit(500)
    .get();
  const now = Date.now();
  const out: DepositRecord[] = [];
  snap.forEach((d) => {
    const dep = d.data() as {
      status?: string;
      amountNgn?: number;
      createdAt?: number;
    };
    const createdAt = Number(dep.createdAt) || 0;
    const amount = Number(dep.amountNgn) || 0;
    const counts =
      dep.status === "success" ||
      ((dep.status === "initiated" || dep.status === "pending") &&
        now - createdAt < 60 * 60 * 1000);
    if (counts && amount > 0) out.push({ amount, createdAt });
  });
  return out;
}

/** Deposits switch, 18+, break, and deposit limits — in that order. */
export async function requireDepositAllowed(
  uid: string,
  amount: number
): Promise<GateResult> {
  if (!depositsEnabled()) {
    return {
      ok: false,
      error: "Deposits are temporarily unavailable. You can still bet with your balance and withdraw.",
      code: "deposits_disabled",
      status: 503,
    };
  }
  const doc = await loadCompliance(uid);
  const adult = adultCheck(doc);
  if (!adult.ok) return adult;
  const now = Date.now();
  const excluded = exclusionCheck(doc, now);
  if (!excluded.ok) return excluded;

  const limitError = checkDepositAgainstLimits(
    doc,
    await recentDeposits(uid),
    amount,
    now
  );
  if (limitError) {
    return { ok: false, error: limitError, code: "deposit_limit", status: 400 };
  }
  return { ok: true };
}
