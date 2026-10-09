import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { writeAdminAudit } from "@/lib/security/adminAudit";
import { requireAdminTotpOnce } from "@/lib/security/adminTotpGuard";

/**
 * GET   — list KYC by status (default pending)
 * PATCH — { uid, status: verified|rejected, reason? }
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") || "pending";
  let snap;
  try {
    snap = await adminDb
      .collection("kyc")
      .where("status", "==", status)
      .orderBy("submittedAt", "desc")
      .limit(50)
      .get();
  } catch {
    snap = await adminDb
      .collection("kyc")
      .where("status", "==", status)
      .limit(50)
      .get();
  }

  const items = snap.docs.map((d) => d.data());
  items.sort(
    (a, b) => Number(b.submittedAt ?? 0) - Number(a.submittedAt ?? 0)
  );
  return NextResponse.json({ items });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    uid?: string;
    status?: string;
    reason?: string;
    totpCode?: string;
  };

  const totpErr = await requireAdminTotpOnce(body.totpCode);
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }

  const uid = String(body.uid ?? "").trim();
  const status = body.status === "verified" ? "verified" : body.status === "rejected" ? "rejected" : null;
  if (!uid || !status) {
    return NextResponse.json({ error: "uid and status required" }, { status: 400 });
  }

  const ref = adminDb.collection("kyc").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "KYC not found" }, { status: 404 });
  }

  const now = Date.now();
  await ref.update({
    status,
    rejectReason: status === "rejected" ? String(body.reason ?? "").slice(0, 300) || "Rejected" : null,
    reviewedAt: now,
    reviewedBy: admin.uid,
    updatedAt: now,
  });

  await writeAdminAudit({
    adminUid: admin.uid,
    adminEmail: admin.email ?? null,
    action: status === "verified" ? "kyc_verify" : "kyc_reject",
    targetType: "kyc",
    targetId: uid,
    meta: { reason: body.reason ?? null },
  });

  return NextResponse.json({ ok: true });
}
