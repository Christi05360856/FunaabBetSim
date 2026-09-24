import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { z } from "zod";

const schema = z.object({ matchId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { matchId } = parsed.data;
  const ref = adminDb.collection("matches").doc(matchId);
  const snap = await ref.get();
  
  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  
  const match = snap.data()!;
  if (match.status !== "open") {
    return NextResponse.json({ error: "Match is not open" }, { status: 400 });
  }

  await ref.update({ status: "scheduled", updatedAt: Date.now() });
  return NextResponse.json({ ok: true, message: "Betting closed" });
}

