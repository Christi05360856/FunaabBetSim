import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/** Public list of active sponsors (no auth). */
export async function GET() {
  const snap = await adminDb
    .collection("sponsors")
    .where("active", "==", true)
    .limit(30)
    .get();
  const items = snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return NextResponse.json({ ok: true, items });
}
