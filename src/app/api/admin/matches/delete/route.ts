import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";

const bodySchema = z.object({ matchId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { matchId } = parsed.data;

  // Hard safety rail: never delete a match that has ANY bet on it, ever —
  // even a lost/void one. Betting history must survive, per spec. Deletion
  // is only for genuine test/mistake fixtures nobody has bet on yet.
  const anyBetSnap = await adminDb.collection("bets").where("matchId", "==", matchId).limit(1).get();
  if (!anyBetSnap.empty) {
    return NextResponse.json(
      { error: "Cannot delete — this match has bets on it. Use void instead." },
      { status: 400 }
    );
  }

  const marketSnap = await adminDb.collection("markets").where("matchId", "==", matchId).get();
  const batch = adminDb.batch();
  marketSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(adminDb.collection("matches").doc(matchId));
  await batch.commit();

  return NextResponse.json({ ok: true });
}
