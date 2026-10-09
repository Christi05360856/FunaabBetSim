import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { normalizeAccountName } from "@/lib/security/sessionGate";
import { requireAdult } from "@/lib/compliance/gate";
import { hashNin, ninLast4 } from "@/lib/compliance/pii";
import { namesMatch } from "@/lib/kyc/nameMatch";
import { flutterwaveResolveAccount } from "@/lib/payments/flutterwave";

/**
 * GET  — current user's KYC record (sensitive fields removed)
 * POST — submit / resubmit KYC (pending)
 *
 * Path: src/app/api/kyc/route.ts
 */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snap = await adminDb.collection("kyc").doc(user.uid).get();
  if (!snap.exists) {
    return NextResponse.json({
      status: "none",
      record: null,
    });
  }
  const record = { ...(snap.data() ?? {}) } as Record<string, unknown>;
  delete record.nin; // legacy plain-text NIN, never sent back to the browser
  delete record.ninHash;
  return NextResponse.json({ status: record.status ?? "none", record });
}

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await enforceRateLimit("support_ticket", `kyc:${user.uid}`);
  if (blocked) return blocked;

  const adult = await requireAdult(user.uid);
  if (!adult.ok) {
    return NextResponse.json(
      { error: adult.error, code: adult.code },
      { status: adult.status }
    );
  }

  const existing = await adminDb.collection("kyc").doc(user.uid).get();
  if (existing.exists && existing.data()?.status === "verified") {
    return NextResponse.json(
      { error: "KYC already verified. Contact support to update bank details." },
      { status: 400 }
    );
  }
  if (existing.exists && existing.data()?.status === "pending") {
    return NextResponse.json(
      { error: "KYC already submitted and waiting for review." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const legalName = String(body.legalName ?? "").trim();
  const phone = String(body.phone ?? "").replace(/\s/g, "");
  const bankCode = String(body.bankCode ?? "").trim();
  const accountNumber = String(body.accountNumber ?? "").replace(/\s/g, "");
  const typedAccountName = String(body.accountName ?? "").trim();
  const ninRaw = String(body.nin ?? "").replace(/\s/g, "");

  if (legalName.length < 5) {
    return NextResponse.json(
      { error: "Enter your full legal name as on your bank account." },
      { status: 400 }
    );
  }
  if (!/^(\+?234|0)[789]\d{9}$/.test(phone)) {
    return NextResponse.json(
      { error: "Enter a valid Nigerian phone number." },
      { status: 400 }
    );
  }
  if (!bankCode) {
    return NextResponse.json({ error: "Select your bank." }, { status: 400 });
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json(
      { error: "Account number must be 10 digits." },
      { status: 400 }
    );
  }

  // Ask the bank who owns the account. When it answers, the BANK's name is the
  // one we keep, and it must match the legal name the player gave. We never
  // show the bank's name back (that would let anyone look up account owners).
  const resolved = await flutterwaveResolveAccount(accountNumber, bankCode);
  let accountName: string;
  let accountNameVerified = false;
  if (resolved) {
    if (!namesMatch(legalName, resolved.accountName)) {
      return NextResponse.json(
        {
          error:
            "The name on that bank account does not match your legal name. Use an account in your own name.",
        },
        { status: 400 }
      );
    }
    accountName = normalizeAccountName(resolved.accountName);
    accountNameVerified = true;
  } else {
    if (process.env.KYC_REQUIRE_NAME_RESOLVE?.trim().toLowerCase() === "true") {
      return NextResponse.json(
        {
          error:
            "We could not verify that bank account right now. Check the details or try again later.",
        },
        { status: 400 }
      );
    }
    accountName = normalizeAccountName(typedAccountName);
    if (accountName.length < 3) {
      return NextResponse.json(
        { error: "Account name must match your bank records." },
        { status: 400 }
      );
    }
  }

  // NIN is optional. We keep only the last 4 digits and a keyed fingerprint.
  let last4: string | null = null;
  let fingerprint: string | null = null;
  if (ninRaw) {
    if (!/^\d{11}$/.test(ninRaw)) {
      return NextResponse.json(
        { error: "NIN must be 11 digits if provided." },
        { status: 400 }
      );
    }
    last4 = ninLast4(ninRaw);
    fingerprint = hashNin(ninRaw);
  }

  // One person, one account: the same bank account or NIN cannot sit on two users.
  const sameAccount = await adminDb
    .collection("kyc")
    .where("accountNumber", "==", accountNumber)
    .limit(5)
    .get();
  const accountTaken = sameAccount.docs.some((d) => {
    const k = d.data() as { uid?: string; bankCode?: string; status?: string };
    return (
      d.id !== user.uid &&
      k.bankCode === bankCode &&
      (k.status === "pending" || k.status === "verified")
    );
  });
  if (accountTaken) {
    return NextResponse.json(
      { error: "This bank account is already linked to another player." },
      { status: 409 }
    );
  }
  if (fingerprint) {
    const sameNin = await adminDb
      .collection("kyc")
      .where("ninHash", "==", fingerprint)
      .limit(5)
      .get();
    if (sameNin.docs.some((d) => d.id !== user.uid)) {
      return NextResponse.json(
        { error: "This NIN is already linked to another player." },
        { status: 409 }
      );
    }
  }

  const now = Date.now();
  const record = {
    uid: user.uid,
    email: user.email ?? null,
    legalName,
    phone,
    bankCode,
    accountNumber,
    accountName,
    accountNameVerified,
    ninLast4: last4,
    ninHash: fingerprint,
    nin: FieldValue.delete(), // remove any plain-text NIN from an older submission
    status: "pending" as const,
    rejectReason: null,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: now,
  };

  await adminDb.collection("kyc").doc(user.uid).set(record, { merge: true });

  return NextResponse.json({ ok: true, status: "pending" });
}
  
