import { NextResponse, type NextRequest } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { adminDb } from "@/lib/firebase/admin";
import type { Bet, Match, Team } from "@/types/domain";

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

async function findBetSnap(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let snap = await adminDb.collection("bets").doc(trimmed).get();
  if (snap.exists) return snap;

  const code = trimmed.toUpperCase().replace(/\s+/g, "");
  const byCode = await adminDb
    .collection("bets")
    .where("ticketCode", "==", code)
    .limit(1)
    .get();
  if (!byCode.empty) return byCode.docs[0];

  for (const candidate of [code, code.toLowerCase(), trimmed.toLowerCase()]) {
    if (candidate === trimmed) continue;
    snap = await adminDb.collection("bets").doc(candidate).get();
    if (snap.exists) return snap;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const limited = await enforceRateLimit("verify_ticket", `ip:${ip}`);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("id") || searchParams.get("ticket") || "").trim();

  if (!raw) {
    return NextResponse.json({ error: "Ticket ID is required" }, { status: 400 });
  }

  const betSnap = await findBetSnap(raw);
  if (!betSnap) {
    return NextResponse.json(
      {
        error:
          "Ticket not found. Open Share on that bet, wait a second, tap Copy ticket ID, then paste here.",
      },
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

  const ticketCode =
    (bet as Bet & { ticketCode?: string }).ticketCode || bet.id.toUpperCase();

  return NextResponse.json({
    ok: true,
    bet: {
      id: bet.id,
      ticketCode,
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
