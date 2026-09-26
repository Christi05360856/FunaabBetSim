import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { hideBetSchema } from "@/lib/validation/schemas";
import type { Bet } from "@/types/domain";

// Lets a bettor remove a ticket from their own history view without
// deleting it — settlement, transactions, and every other record of the
// bet are untouched. Only the bet's own owner can hide/unhide it.
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = hideBetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { betId, hidden } = parsed.data;

  const betRef = adminDb.collection("bets").doc(betId);
  const betSnap = await betRef.get();
  if (!betSnap.exists) {
    return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  }
  const bet = betSnap.data() as Bet;
  if (bet.uid !== decoded.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await betRef.update({ hidden });

  return NextResponse.json({ ok: true });
}
