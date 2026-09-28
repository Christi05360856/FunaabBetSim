import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Bet } from "@/types/domain";

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const betId = typeof body.betId === "string" ? body.betId.trim() : "";
  if (!betId) {
    return NextResponse.json({ error: "betId required" }, { status: 400 });
  }

  const ref = adminDb.collection("bets").doc(betId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const bet = snap.data() as Bet;
  if (bet.uid !== decoded.uid && bet.userId !== decoded.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = (bet as Bet & { ticketCode?: string }).ticketCode;
  const ticketCode = existing || betId.toUpperCase();
  if (!existing) {
    await ref.update({ ticketCode });
  }

  return NextResponse.json({ ok: true, ticketCode, id: betId });
}
