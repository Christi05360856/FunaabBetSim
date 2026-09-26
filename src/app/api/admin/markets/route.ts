import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { z } from "zod";
import type { Market, Selection } from "@/types/domain";

const selectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  odds: z.number().min(1.01).max(1000),
});

const bodySchema = z.object({
  matchId: z.string().min(1),
  type: z.enum(["match_winner", "double_chance", "draw_no_bet", "over_under", "both_teams_to_score", "correct_score"]),
  line: z.number().optional(), // For over_under
  selections: z.array(selectionSchema).min(2),
});

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const { matchId, type, line, selections } = parsed.data;

  const matchSnap = await adminDb.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 400 });
  }

  // Check if market already exists for this match+type — for Over/Under,
  // scope that check to the specific line too, since a match can (and
  // should) offer several goal lines (0.5, 1.5, 2.5…) at once, each as its
  // own market. Every other market type still has exactly one per match.
  let existingQuery = adminDb
    .collection("markets")
    .where("matchId", "==", matchId)
    .where("type", "==", type);
  if (type === "over_under" && line !== undefined) {
    existingQuery = existingQuery.where("line", "==", line);
  }
  const existingSnap = await existingQuery.limit(1).get();

  if (!existingSnap.empty) {
    const message =
      type === "over_under"
        ? `A ${line ?? ""} goals Over/Under market already exists for this match`
        : "Market already exists for this match";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const now = Date.now();
  const ref = adminDb.collection("markets").doc();
  
  const market: Market = {
    id: ref.id,
    matchId,
    type,
    status: "active",
    selections: selections as Selection[],
    createdAt: now,
    updatedAt: now,
  };

  // Add line for over_under markets
  if (type === "over_under" && line !== undefined) {
    (market as any).line = line;
  }

  await ref.set(market);

  return NextResponse.json({ ok: true, id: ref.id });
}
