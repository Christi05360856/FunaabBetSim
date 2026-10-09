import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { requireRecentAuth } from "@/lib/security/sessionGate";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { reservePinAttempt } from "@/lib/security/pinAttempts";
import { securityLog } from "@/lib/security/securityLog";
import {
  hashPin,
  isValidPinFormat,
  isWeakPin,
  verifyPin,
} from "@/lib/security/withdrawPin";

type PinDoc = {
  pinHash?: string;
  pinSalt?: string;
  pinSetAt?: number;
  pinFailCount?: number;
  pinLockedUntil?: number;
  updatedAt?: number;
};

function pinRef(uid: string) {
  return adminDb.collection("user_security").doc(uid);
}

/** GET — whether PIN is set (never returns the PIN). */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snap = await pinRef(user.uid).get();
  const d = (snap.data() ?? {}) as PinDoc;
  const hasPin = Boolean(d.pinHash && d.pinSalt);
  const lockedUntil = Number(d.pinLockedUntil ?? 0);
  return NextResponse.json({
    ok: true,
    hasPin,
    locked:
      hasPin && lockedUntil > Date.now()
        ? { until: lockedUntil }
        : null,
  });
}

/**
 * POST — set or change withdrawal PIN.
 * Body: { pin, confirmPin, currentPin? }
 * First set: no currentPin. Change: currentPin required.
 * Forgot flow: client re-auths with password then sends { pin, confirmPin, reset: true }.
 */
export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const recent = requireRecentAuth(user);
  if (!recent.ok) {
    return NextResponse.json({ error: recent.error }, { status: 401 });
  }

  const limited = await enforceRateLimit(
    "support_ticket",
    `pin:${user.uid}`
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const pin = String(body.pin ?? "").trim();
  const confirmPin = String(body.confirmPin ?? "").trim();
  const currentPin = String(body.currentPin ?? "").trim();
  const reset = body.reset === true;

  if (!isValidPinFormat(pin) || !isValidPinFormat(confirmPin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits" },
      { status: 400 }
    );
  }
  if (pin !== confirmPin) {
    return NextResponse.json(
      { error: "PIN and confirmation do not match" },
      { status: 400 }
    );
  }
  if (isWeakPin(pin)) {
    return NextResponse.json(
      { error: "Choose a stronger PIN (avoid 1234, 0000, repeated digits)" },
      { status: 400 }
    );
  }

  const ref = pinRef(user.uid);
  const snap = await ref.get();
  const d = (snap.data() ?? {}) as PinDoc;
  const hasPin = Boolean(d.pinHash && d.pinSalt);

  if (hasPin && !reset) {
    if (!isValidPinFormat(currentPin)) {
      return NextResponse.json(
        { error: "Enter your current PIN to change it" },
        { status: 400 }
      );
    }
    // Count the attempt atomically before checking (closes the parallel-guess race).
    const attempt = await reservePinAttempt(user.uid);
    if (!attempt.ok) {
      const mins = Math.max(1, Math.ceil((attempt.lockedUntil - Date.now()) / 60000));
      return NextResponse.json(
        { error: `Too many attempts. Try again in about ${mins} minute(s).` },
        { status: 429 }
      );
    }
    if (!verifyPin(currentPin, d.pinSalt!, d.pinHash!)) {
      return NextResponse.json(
        { error: "Current PIN is incorrect" },
        { status: 403 }
      );
    }
  }

  // reset: true only after client password re-auth (fresh token already required)
  if (hasPin && reset && currentPin) {
    return NextResponse.json(
      { error: "Use either current PIN or reset after password confirm, not both" },
      { status: 400 }
    );
  }

  const { hash, salt } = hashPin(pin);
  const now = Date.now();
  await ref.set(
    {
      pinHash: hash,
      pinSalt: salt,
      pinSetAt: now,
      pinFailCount: 0,
      pinLockedUntil: 0,
      updatedAt: now,
    },
    { merge: true }
  );

  void securityLog({
    type: hasPin ? "PIN_CHANGED" : "PIN_SET",
    uid: user.uid,
    ip: clientIp(request),
  });

  return NextResponse.json({
    ok: true,
    message: hasPin ? "Withdrawal PIN updated" : "Withdrawal PIN set",
  });
}
