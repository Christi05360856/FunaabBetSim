import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { z } from "zod";
import type { Match, MatchStatus } from "@/types/domain";

const schema = z.object({ matchId: z.string().min(1) });

const FINAL: MatchStatus[] = ["settled", "voided"];
const IN_PLAY: MatchStatus[] = ["live", "halftime", "second_half"];

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { matchId } = parsed.data;
  const ref = adminDb.collection("matches").doc(matchId);
  const snap = await ref.get();

  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const match = snap.data() as Match;

  if (FINAL.includes(match.status)) {
    // Reopening a fully settled/voided match — unchanged behavior.
    // Note: this does not reverse bet settlements. Use only for testing corrections.
    await ref.update({
      status: "open",
      homeScore: null,
      awayScore: null,
      currentHomeScore: null,
      currentAwayScore: null,
      updatedAt: Date.now(),
    });
    revalidateTag("fixtures-core");
    return NextResponse.json({ ok: true, message: "Match reopened" });
  }

  if (IN_PLAY.includes(match.status)) {
    // Undoing an accidental "Start live" — only safe when nothing has been
    // auto-settled off the live score yet (see live-score/route.ts's
    // clinched-market logic). If any bet already got paid out based on
    // that live score, silently reverting the match would leave the
    // payout standing with no matching record of why — so we refuse and
    // tell the admin to let it play out and settle normally instead.
    const clinchedSnap = await adminDb
      .collection("bets")
      .where("matchId", "==", matchId)
      .where("status", "in", ["won", "lost"])
      .limit(1)
      .get();
    if (!clinchedSnap.empty) {
      return NextResponse.json(
        { error: "Can't undo — some bets have already been auto-settled from the live score. Settle the match normally instead." },
        { status: 400 }
      );
    }

    await ref.update({
      status: "open",
      currentHomeScore: null,
      currentAwayScore: null,
      updatedAt: Date.now(),
    });
    revalidateTag("fixtures-core");
    return NextResponse.json({ ok: true, message: "Live start undone — match is Open again" });
  }

  return NextResponse.json({ error: "Match is not in a final or in-play state" }, { status: 400 });
}
