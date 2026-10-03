import { randomInt } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";
import { adminDb } from "@/lib/firebase/admin";
import type { BetLeg, BookingCode, Market, Match } from "@/types/domain";

/** Booking codes: FB- + 5 chars (crypto RNG). */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(randomInt(chars.length));
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

function matchStillBettable(status: string | undefined): boolean {
  if (!status) return false;
  // Align with place-bet: closed/live/settled etc. not bookable as "fresh"
  const bad = new Set([
    "settled",
    "voided",
    "postponed",
    "cancelled",
    "finished",
    "result_confirmed",
  ]);
  return !bad.has(status);
}

/**
 * M-02: resolve legs against live markets — never trust client odds.
 */
async function resolveLegsFromServer(
  rawLegs: Array<{
    matchId?: string;
    marketId?: string;
    selectionId?: string;
  }>
): Promise<{ legs: BetLeg[]; totalOdds: number; errors: string[] }> {
  const errors: string[] = [];
  const legs: BetLeg[] = [];
  let totalOdds = 1;

  for (let i = 0; i < rawLegs.length; i++) {
    const raw = rawLegs[i]!;
    const matchId = String(raw.matchId ?? "").trim();
    const marketId = String(raw.marketId ?? "").trim();
    const selectionId = String(raw.selectionId ?? "").trim();
    if (!matchId || !marketId || !selectionId) {
      errors.push(`Leg ${i + 1}: missing match/market/selection`);
      continue;
    }

    const [matchSnap, marketSnap] = await Promise.all([
      adminDb.collection("matches").doc(matchId).get(),
      adminDb.collection("markets").doc(marketId).get(),
    ]);

    if (!matchSnap.exists) {
      errors.push(`Leg ${i + 1}: match not found`);
      continue;
    }
    if (!marketSnap.exists) {
      errors.push(`Leg ${i + 1}: market not found`);
      continue;
    }

    const match = matchSnap.data() as Match;
    const market = marketSnap.data() as Market;

    if (!matchStillBettable(match.status)) {
      errors.push(`Leg ${i + 1}: match is ${match.status}`);
      continue;
    }
    if (market.status !== "active") {
      errors.push(`Leg ${i + 1}: market not active`);
      continue;
    }
    if (market.matchId !== match.id && market.matchId !== matchId) {
      errors.push(`Leg ${i + 1}: market does not belong to match`);
      continue;
    }

    const selection = market.selections?.find((s) => s.id === selectionId);
    if (!selection) {
      errors.push(`Leg ${i + 1}: selection not on market`);
      continue;
    }
    if (
      (selection as { suspended?: boolean }).suspended === true ||
      (selection as { active?: boolean }).active === false
    ) {
      errors.push(`Leg ${i + 1}: selection suspended`);
      continue;
    }

    const liveOdds = Number(selection.odds);
    if (!Number.isFinite(liveOdds) || liveOdds < 1.01) {
      errors.push(`Leg ${i + 1}: invalid server odds`);
      continue;
    }

    legs.push({
      matchId,
      marketId,
      selectionId: selection.id,
      selectionLabel: selection.label || selectionId,
      odds: liveOdds,
    });
    totalOdds *= liveOdds;
  }

  totalOdds = Math.round(totalOdds * 10000) / 10000;
  return { legs, totalOdds, errors };
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limited = await enforceRateLimit("book_code", `ip:${ip}`);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const { legs: rawLegs } = body as { legs?: unknown[] };

  if (!rawLegs || !Array.isArray(rawLegs) || rawLegs.length === 0) {
    return NextResponse.json(
      { error: "No selections provided to book" },
      { status: 400 }
    );
  }
  if (rawLegs.length > 20) {
    return NextResponse.json(
      { error: "Too many selections on one booking code" },
      { status: 400 }
    );
  }

  try {
    const { legs, totalOdds, errors } = await resolveLegsFromServer(
      rawLegs as Array<{
        matchId?: string;
        marketId?: string;
        selectionId?: string;
      }>
    );

    if (legs.length === 0) {
      return NextResponse.json(
        {
          error: errors[0] ?? "No valid selections to book",
          details: errors,
        },
        { status: 400 }
      );
    }
    if (errors.length > 0 && legs.length < rawLegs.length) {
      return NextResponse.json(
        {
          error: "Some selections are invalid or closed",
          details: errors,
        },
        { status: 400 }
      );
    }

    const code = await allocateUniqueCode();
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
      meta: { code, legCount: legs.length, totalOdds },
    });

    return NextResponse.json({ ok: true, code, totalOdds, legs });
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
  const stored = booking.legs ?? [];

  if (stored.length === 0) {
    return NextResponse.json(
      { error: "Booking code has no selections" },
      { status: 400 }
    );
  }

  // M-02 on load: refresh odds from server; drop finished legs with clear error
  const { legs, totalOdds, errors } = await resolveLegsFromServer(stored);

  if (legs.length === 0) {
    return NextResponse.json(
      {
        error:
          errors[0] ??
          "All selections for this code are invalid or finished",
        details: errors,
      },
      { status: 410 }
    );
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        ok: true,
        booking: {
          ...booking,
          legs,
          totalOdds,
        },
        warning: "Some selections were removed or updated",
        details: errors,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    booking: {
      ...booking,
      legs,
      totalOdds,
    },
  });
       }
