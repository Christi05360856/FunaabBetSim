import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/** Public list of active sponsors (no auth). */
export async function GET() {
  try {
    const snap = await adminDb.collection("sponsors").limit(40).get();
    const items = snap.docs
      .map((d) => d.data())
      .filter((s) => s.active !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("sponsors list", e);
    return NextResponse.json({ ok: true, items: [] });
  }
}
