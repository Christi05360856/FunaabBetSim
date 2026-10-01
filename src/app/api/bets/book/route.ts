import { NextResponse, type NextRequest } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";
import { adminDb } from "@/lib/firebase/admin";
import type { BetLeg, BookingCode, Match } from "@/types/domain";

/** Phase 4: longer code space (8 chars ≈ 32^8, avoids easy enumeration). */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "FB-" + code;
}

async function allocateUniqueCode(maxAttempts = 6): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateCode();
    const existing = await adminDb.collection("booking_codes").doc(code).get();
    if (!existing.exists) return code;
  }
  throw new Error("Could not allocate booking code");
}

function isMatchFinished(status: string | undefined): boolean {
  return (
    status === "settled" ||
    status === "finished" ||
    status === "result_confirmed" ||
    status === "voided" ||
    status === "postponed"
  );
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limited = await enforceRateLimit("book_code", `ip:${ip}`);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const { legs } = body as { legs?: BetLeg[] };

  if (!legs || !Array.isArray(legs) || legs.length === 0) {
    return NextResponse.json(
      { error: "No selections provided to book" },
      { status: 400 }
    );
  }

  // Cap legs to stop payload abuse
  if (legs.length > 20) {
    return NextResponse.json(
      { error: "Too many selections on one booking code" },
      { status: 400 }
    );
  }

  try {
    const code = await allocateUniqueCode();
    const totalOdds = legs.reduce((acc, l) => acc * (Number(l.odds) || 1), 1);
    const now = Date.now();

    const doc: BookingCode = {
      id: code,
      legs,
      totalOdds,
      createdAt: now,
    };

    await adminDb.collection("booking_codes").doc(code).set(doc);
    void securityLog({
      type: "BOOK_CODE",
      ip,
      meta: { code, legCount: legs.length },
    });

    return NextResponse.json({ ok: true, code, totalOdds });
  } catch {
    return NextResponse.json(
      { error: "Could not create booking code" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const limited = await enforceRateLimit("book_code", `load:${ip}`);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code")?.trim() ?? "";
  const code = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);

  if (!code) {
    return NextResponse.json(
      { error: "Code parameter missing" },
      { status: 400 }
    );
  }

  const snap = await adminDb.collection("booking_codes").doc(code).get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "Booking code not found or expired" },
      { status: 404 }
    );
  }

  const booking = snap.data() as BookingCode;
  const legs = booking.legs ?? [];

  if (legs.length === 0) {
    return NextResponse.json(
      { error: "Booking code has no selections" },
      { status: 400 }
    );
  }

  const matchSnaps = await Promise.all(
    legs.map((l) => adminDb.collection("matches").doc(l.matchId).get())
  );

  let finishedCount = 0;
  let missingCount = 0;
  for (const ms of matchSnaps) {
    if (!ms.exists) {
      missingCount++;
      continue;
    }
    const m = ms.data() as Match;
    if (isMatchFinished(m.status)) finishedCount++;
  }

  if (finishedCount + missingCount >= legs.length) {
    return NextResponse.json(
      {
        error: "All selections for this code have finished",
        code,
        finished: true,
      },
      { status: 410 }
    );
  }

  if (finishedCount > 0) {
    return NextResponse.json(
      {
        error:
          finishedCount +
          " of " +
          legs.length +
          " selection(s) already finished — code cannot be loaded",
        code,
        finished: true,
      },
      { status: 410 }
    );
  }

  // Hydrate team / market labels (stored on new codes; older codes get lookup)
  const teamIds = new Set<string>();
  const matchMap = new Map<string, Match>();
  for (const ms of matchSnaps) {
    if (!ms.exists) continue;
    const m = ms.data() as Match;
    matchMap.set(ms.id, m);
    if (m.homeTeamId) teamIds.add(m.homeTeamId);
    if (m.awayTeamId) teamIds.add(m.awayTeamId);
  }
  const teamMap = new Map<string, { name?: string; shortName?: string }>();
  if (teamIds.size > 0) {
    const snaps = await Promise.all(
      Array.from(teamIds).map((id) => adminDb.collection("teams").doc(id).get())
    );
    for (const s of snaps) {
      if (s.exists) {
        teamMap.set(s.id, s.data() as { name?: string; shortName?: string });
      }
    }
  }

  const enrichedLegs = legs.map((l) => {
    const leg = l as BetLeg & {
      homeTeamName?: string;
      awayTeamName?: string;
      marketName?: string;
    };
    const m = matchMap.get(leg.matchId);
    const homeTeam = m?.homeTeamId ? teamMap.get(m.homeTeamId) : undefined;
    const awayTeam = m?.awayTeamId ? teamMap.get(m.awayTeamId) : undefined;
    const home =
      (leg.homeTeamName && leg.homeTeamName !== "Home"
        ? leg.homeTeamName
        : null) ||
      homeTeam?.name ||
      homeTeam?.shortName ||
      leg.homeTeamName ||
      "Home";
    const away =
      (leg.awayTeamName && leg.awayTeamName !== "Away"
        ? leg.awayTeamName
        : null) ||
      awayTeam?.name ||
      awayTeam?.shortName ||
      leg.awayTeamName ||
      "Away";
    return {
      ...leg,
      homeTeamName: home,
      awayTeamName: away,
      marketName: leg.marketName || "Market",
    };
  });

  return NextResponse.json({
    ok: true,
    booking: { ...booking, legs: enrichedLegs },
  });
}
