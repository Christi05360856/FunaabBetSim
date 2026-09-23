import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { matchWinnerMarketSchema } from "@/lib/validation/schemas";
import type { Market } from "@/types/domain";

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = matchWinnerMarketSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const { matchId, homeOdds, drawOdds, awayOdds } = parsed.data;

  const matchSnap = await adminDb.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 400 });
  }

  // One Match Winner market per match for now — no edit flow yet, so block
  // silent duplicates rather than let the fixtures page show two odds sets.
  const existing = await adminDb
    .collection("markets")
    .where("matchId", "==", matchId)
    .where("type", "==", "match_winner")
    .limit(1)
    .get();
  if (!existing.empty) {
    return NextResponse.json(
      { error: "This match already has a Match Winner market." },
      { status: 400 }
    );
  }

  const now = Date.now();
  const ref = adminDb.collection("markets").doc();
  const market: Market = {
    id: ref.id,
    matchId,
    type: "match_winner",
    status: "active",
    selections: [
      { id: "home", label: "Home", odds: homeOdds },
      { id: "draw", label: "Draw", odds: drawOdds },
      { id: "away", label: "Away", odds: awayOdds },
    ],
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(market);

  return NextResponse.json({ ok: true, id: ref.id });
}
