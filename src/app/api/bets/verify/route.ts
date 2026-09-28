import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { Bet, Match, Team } from "@/types/domain";

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("id") || searchParams.get("ticket") || "").trim();

  if (!raw) {
    return NextResponse.json({ error: "Ticket ID is required" }, { status: 400 });
  }

  const upper = raw.toUpperCase();
  let betSnap = await adminDb.collection("bets").doc(raw).get();
  if (!betSnap.exists) {
    betSnap = await adminDb.collection("bets").doc(upper).get();
  }
  if (!betSnap.exists) {
    return NextResponse.json(
      { error: "Ticket not found. Use the full ticket ID." },
      { status: 404 }
    );
  }

  const bet = { ...(betSnap.data() as Bet), id: betSnap.id };

  if (bet.placedAt && Date.now() - bet.placedAt > SIX_MONTHS_MS) {
    return NextResponse.json(
      {
        error:
          "This ticket is older than 6 months and can no longer be verified.",
      },
      { status: 410 }
    );
  }

  const legs =
    bet.legs && bet.legs.length > 0
      ? bet.legs
      : [
          {
            matchId: bet.matchId,
            marketId: bet.marketId,
            selectionId: bet.selectionId,
            selectionLabel: bet.selectionLabel,
            odds: bet.oddsAtPlacement,
            status:
              bet.status === "won"
                ? "won"
                : bet.status === "lost"
                  ? "lost"
                  : "pending",
          },
        ];

  const matchIds = Array.from(new Set(legs.map((l) => l.matchId)));
  const matchSnaps = await Promise.all(
    matchIds.map((id) => adminDb.collection("matches").doc(id).get())
  );
  const matches: Record<string, Match> = {};
  const teamIds = new Set<string>();
  for (const s of matchSnaps) {
    if (!s.exists) continue;
    const m = s.data() as Match;
    matches[s.id] = m;
    if (m.homeTeamId) teamIds.add(m.homeTeamId);
    if (m.awayTeamId) teamIds.add(m.awayTeamId);
  }
  const teamSnaps = await Promise.all(
    Array.from(teamIds).map((id) => adminDb.collection("teams").doc(id).get())
  );
  const teams: Record<string, Team> = {};
  for (const s of teamSnaps) {
    if (s.exists) teams[s.id] = s.data() as Team;
  }

  return NextResponse.json({
    ok: true,
    bet: {
      id: bet.id,
      status: bet.status,
      stake: bet.stake,
      potentialPayout: bet.potentialPayout,
      payout: bet.payout ?? null,
      placedAt: bet.placedAt,
      settledAt: bet.settledAt ?? null,
      legs,
    },
    matches,
    teams,
  });
}
