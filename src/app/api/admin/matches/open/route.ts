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

  const matchRef = adminDb.collection("matches").doc(parsed.data.matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 400 });
  }

  // Only scheduled → open is allowed here. This route is deliberately narrow —
  // it is NOT a general "set any status" endpoint. Locking, going live, and
  // finishing a match are separate concerns for the settlement milestone.
  if (matchSnap.data()?.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot open betting — match is currently "${matchSnap.data()?.status}"` },
      { status: 400 }
    );
  }

  await matchRef.update({ status: "open", updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
