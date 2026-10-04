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

  // Single orderBy avoids composite-index failures; filter status in memory.
  const snap = await adminDb
    .collection("withdrawals")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  let items = snap.docs.map((d) => d.data() as Withdrawal);
  if (status !== "all") {
    items = items.filter((w) => w.status === status);
  }
  return NextResponse.json({ ok: true, items });
}
