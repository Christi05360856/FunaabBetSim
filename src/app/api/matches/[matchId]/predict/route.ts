import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";

type Pick = "home" | "draw" | "away";

function isPick(v: unknown): v is Pick {
  return v === "home" || v === "draw" || v === "away";
}

function voteRef(matchId: string, uid: string) {
  return adminDb.collection("match_votes").doc(`${matchId}_${uid}`);
}

function statsRef(matchId: string) {
  return adminDb.collection("match_prediction_stats").doc(matchId);
}

/** GET — aggregate + caller's vote (auth required). */
export async function GET(
  request: NextRequest,
  context: { params: { matchId: string } }
) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to view predictions" }, { status: 401 });
  }

  const matchId = String(context.params.matchId ?? "").trim();
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match" }, { status: 400 });
  }

  const [statsSnap, voteSnap, matchSnap] = await Promise.all([
    statsRef(matchId).get(),
    voteRef(matchId, user.uid).get(),
    adminDb.collection("matches").doc(matchId).get(),
  ]);

  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const match = matchSnap.data() as { status?: string; kickoffAt?: number };
  const stats = statsSnap.exists
    ? (statsSnap.data() as { home: number; draw: number; away: number })
    : { home: 0, draw: 0, away: 0 };

  const locked =
    Number(match.kickoffAt ?? 0) <= Date.now() ||
    ["live", "halftime", "second_half", "finished", "result_confirmed", "settled"].includes(
      String(match.status ?? "")
    );

  return NextResponse.json({
    ok: true,
    stats: {
      home: Number(stats.home) || 0,
      draw: Number(stats.draw) || 0,
      away: Number(stats.away) || 0,
    },
    myPick: voteSnap.exists ? (voteSnap.data() as { pick: Pick }).pick : null,
    locked,
  });
}

/** POST — one vote per match; locked after kickoff. */
export async function POST(
  request: NextRequest,
  context: { params: { matchId: string } }
) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to vote" }, { status: 401 });
  }

  const limited = await enforceRateLimit("match_predict", `uid:${user.uid}`);
  if (limited) return limited;

  const matchId = String(context.params.matchId ?? "").trim();
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isPick(body.pick)) {
    return NextResponse.json({ error: "Pick home, draw, or away" }, { status: 400 });
  }
  const pick = body.pick as Pick;

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const mRef = adminDb.collection("matches").doc(matchId);
      const mSnap = await tx.get(mRef);
      if (!mSnap.exists) throw new Error("Match not found");
      const match = mSnap.data() as { status?: string; kickoffAt?: number };

      const locked =
        Number(match.kickoffAt ?? 0) <= Date.now() ||
        ["live", "halftime", "second_half", "finished", "result_confirmed", "settled"].includes(
          String(match.status ?? "")
        );
      if (locked) throw new Error("Voting closed — match already started");

      const vRef = voteRef(matchId, user.uid);
      const vSnap = await tx.get(vRef);
      if (vSnap.exists) throw new Error("You already voted on this match");

      const sRef = statsRef(matchId);
      const sSnap = await tx.get(sRef);
      const prev = sSnap.exists
        ? (sSnap.data() as { home: number; draw: number; away: number })
        : { home: 0, draw: 0, away: 0 };
      const next = {
        home: Number(prev.home) || 0,
        draw: Number(prev.draw) || 0,
        away: Number(prev.away) || 0,
        updatedAt: Date.now(),
      };
      next[pick] += 1;

      tx.set(vRef, { matchId, uid: user.uid, pick, createdAt: Date.now() });
      tx.set(sRef, next, { merge: true });

      return { stats: { home: next.home, draw: next.draw, away: next.away }, myPick: pick };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status =
      msg.includes("already") || msg.includes("closed") || msg.includes("not found")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
