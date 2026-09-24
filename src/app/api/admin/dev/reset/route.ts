import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const collections = ["matches", "teams", "competitions", "markets", "bets", "transactions"];
  
  for (const colName of collections) {
    const snapshot = await adminDb.collection(colName).get();
    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  return NextResponse.json({ ok: true, message: "Platform reset complete" });
}

