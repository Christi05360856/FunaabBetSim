import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";

/** GET — recent admin actions (newest first). */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snap = await adminDb
    .collection("admin_audit")
    .orderBy("createdAt", "desc")
    .limit(80)
    .get();

  const items = snap.docs.map((d) => d.data());
  return NextResponse.json({ items });
}
