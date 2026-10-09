import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { safeEqual } from "@/lib/security/safeCompare";
import { settleMatchScores } from "@/lib/domain/settleMatchScores";
import type { Match } from "@/types/domain";

/**
 * Auto-settle external matches that already have FT scores (status finished).
 * Auth: Authorization: Bearer <CRON_SECRET>  or  x-cron-secret: <CRON_SECRET>
 *
 * Vercel Cron hits this on a schedule. Also safe to call manually from RestPilot.
 */
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") || "";
  const headerSecret =
    request.headers.get("x-cron-secret") ||
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "");

  if (!headerSecret || !safeEqual(headerSecret, secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Single-field query (no composite index). Filter source in memory.
  const snap = await adminDb
    .collection("matches")
    .where("status", "==", "finished")
    .limit(30)
    .get();

  const settled: Array<{ id: string; betsSettled: number }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const doc of snap.docs) {
    const m = { ...(doc.data() as Match), id: doc.id };
    if (m.source !== "external") {
      skipped.push({ id: doc.id, reason: "not_external" });
      continue;
    }
    const hs = m.homeScore;
    const as = m.awayScore;
    if (hs == null || as == null || !Number.isFinite(Number(hs)) || !Number.isFinite(Number(as))) {
      skipped.push({ id: doc.id, reason: "missing_scores" });
      continue;
    }

    try {
      const result = await settleMatchScores({
        matchId: doc.id,
        homeScore: Number(hs),
        awayScore: Number(as),
        skipEarlyGate: true,
      });
      if (result.alreadySettled) {
        skipped.push({ id: doc.id, reason: "already_settled" });
      } else {
        settled.push({ id: doc.id, betsSettled: result.betsSettled });
      }
    } catch (e) {
      errors.push({
        id: doc.id,
        error: e instanceof Error ? e.message : "settle failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: snap.size,
    settled: settled.length,
    details: { settled, skipped, errors },
  });
}
