import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Withdrawal } from "@/types/domain";

/** Admin: list withdrawals. ?status=pending_review default. */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status =
    request.nextUrl.searchParams.get("status") || "pending_review";

  let q = adminDb
    .collection("withdrawals")
    .orderBy("createdAt", "desc")
    .limit(50);

  if (status !== "all") {
    q = adminDb
      .collection("withdrawals")
      .where("status", "==", status)
      .orderBy("createdAt", "desc")
      .limit(50);
  }

  const snap = await q.get();
  const items = snap.docs.map((d) => d.data() as Withdrawal);
  return NextResponse.json({ ok: true, items });
}
