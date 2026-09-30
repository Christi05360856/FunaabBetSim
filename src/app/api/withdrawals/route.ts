import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Withdrawal } from "@/types/domain";

/** List current user's withdrawals (newest first). */
export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snap = await adminDb
    .collection("withdrawals")
    .where("uid", "==", decoded.uid)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();

  const items = snap.docs.map((d) => d.data() as Withdrawal);
  return NextResponse.json({ ok: true, items });
}
