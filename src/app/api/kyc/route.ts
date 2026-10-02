import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { normalizeAccountName } from "@/lib/security/sessionGate";

/**
 * GET  — current user's KYC record
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
  return NextResponse.json({ status: snap.data()?.status ?? "none", record: snap.data() });
}

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await enforceRateLimit("support_ticket", `kyc:${user.uid}`);
  if (blocked) return blocked;

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
  const accountName = String(body.accountName ?? "").trim();
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
  const normalizedName = normalizeAccountName(accountName);
  if (normalizedName.length < 3) {
    return NextResponse.json(
      { error: "Account name must match your bank records." },
      { status: 400 }
    );
  }
  // NIN optional for now; if provided must be 11 digits
  let nin: string | null = null;
  if (ninRaw) {
    if (!/^\d{11}$/.test(ninRaw)) {
      return NextResponse.json(
        { error: "NIN must be 11 digits if provided." },
        { status: 400 }
      );
    }
    nin = ninRaw;
  }

  const now = Date.now();
  const record = {
    uid: user.uid,
    email: user.email ?? null,
    legalName,
    phone,
    bankCode,
    accountNumber,
    accountName: normalizedName,
    nin,
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
