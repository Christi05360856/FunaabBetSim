import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { writeAdminAudit } from "@/lib/security/adminAudit";
import { confirmResultSchema } from "@/lib/validation/schemas";
import { settleMatchScores } from "@/lib/domain/settleMatchScores";
import { MATCH_DURATION_MS } from "@/lib/domain/matchClock";
import { adminDb } from "@/lib/firebase/admin";
import type { Match } from "@/types/domain";

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = confirmResultSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { matchId, homeScore, awayScore, forceEarlyResult, earlyReason } =
    parsed.data;

  try {
    // Surface early-gate shape expected by admin UI before calling core
    const preSnap = await adminDb.collection("matches").doc(matchId).get();
    if (!preSnap.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const preMatch = preSnap.data() as Match;
    const nowMs = Date.now();
    const kickoff = Number(preMatch.kickoffAt) || 0;
    const ftAt = kickoff > 0 ? kickoff + MATCH_DURATION_MS : 0;
    const isEarly = kickoff > 0 && nowMs < ftAt;

    if (isEarly && !forceEarlyResult) {
      return NextResponse.json(
        {
          error:
            "Match has not reached full time yet. Tick “Force early result” and enter a reason to settle now.",
          code: "early_result_requires_force",
          kickoffAt: kickoff,
          fullTimeAt: ftAt,
          status: preMatch.status,
        },
        { status: 400 }
      );
    }

    const result = await settleMatchScores({
      matchId,
      homeScore,
      awayScore,
      forceEarlyResult: Boolean(forceEarlyResult),
      earlyReason,
      skipEarlyGate: false,
    });

    if (isEarly && forceEarlyResult) {
      try {
        await writeAdminAudit({
          uid: decoded.uid,
          action: "force_early_result",
          meta: {
            matchId,
            homeScore,
            awayScore,
            reason: String(earlyReason ?? "").trim(),
          },
        } as never);
      } catch {
        /* non-blocking */
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not confirm result";
    const status = message.includes("full time") ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
