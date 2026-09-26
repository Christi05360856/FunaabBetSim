import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Match, MatchStatus } from "@/types/domain";

const bodySchema = z.object({
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  /** Optional phase change while updating the interim score. */
  status: z.enum(["live", "halftime", "second_half"]).optional(),
});

const IN_PLAY: MatchStatus[] = ["live", "halftime", "second_half"];
const CAN_GO_LIVE: MatchStatus[] = ["open", "locked"];

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

  const { matchId, homeScore, awayScore, status: nextStatus } = parsed.data;
  const matchRef = adminDb.collection("matches").doc(matchId);
  const snap = await matchRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 400 });
  }

  const match = snap.data() as Match;
  const current = match.status;

  // First time: allow open/locked → live. After that, only while already in-play.
  const alreadyInPlay = IN_PLAY.includes(current);
  const startingNow = CAN_GO_LIVE.includes(current) && (nextStatus === "live" || nextStatus === undefined);

  if (!alreadyInPlay && !startingNow) {
    return NextResponse.json(
      { error: `Cannot update live score — match is "${current}"` },
      { status: 400 }
    );
  }

  if (nextStatus && !IN_PLAY.includes(nextStatus)) {
    return NextResponse.json({ error: "Invalid live status" }, { status: 400 });
  }

  const now = Date.now();
  const update: Record<string, unknown> = {
    currentHomeScore: homeScore,
    currentAwayScore: awayScore,
    updatedAt: now,
  };

  if (startingNow && !alreadyInPlay) {
    update.status = nextStatus ?? "live";
  } else if (nextStatus && nextStatus !== current) {
    update.status = nextStatus;
  }

  await matchRef.update(update);
  return NextResponse.json({ ok: true });
}
