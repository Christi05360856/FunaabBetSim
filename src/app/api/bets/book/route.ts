import { randomInt } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";
import { adminDb } from "@/lib/firebase/admin";
import type { BetLeg, BookingCode } from "@/types/domain";
import {
  resolveBookingLegs,
  type RawLegInput,
} from "@/lib/domain/resolveBookingLegs";

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

function toStoredLegs(
  legs: Awaited<ReturnType<typeof resolveBookingLegs>>["legs"]
): BetLeg[] {
  return legs.map((l) => ({
    matchId: l.matchId,
    marketId: l.marketId,
    selectionId: l.selectionId,
    selectionLabel: l.selectionLabel,
    marketType: l.marketType,
    odds: l.odds,
  }));
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
    const resolved = await resolveBookingLegs(rawLegs as RawLegInput[]);

    if (resolved.legs.length === 0) {
      return NextResponse.json(
        {
          error: resolved.dropped[0]?.reason ?? "No valid selections to book",
          details: resolved.dropped.map((d) => d.reason),
          dropped: resolved.dropped,
        },
        { status: 400 }
      );
    }
    if (resolved.dropped.length > 0) {
      return NextResponse.json(
        {
          error: "Some selections are invalid or closed",
          details: resolved.dropped.map((d) => d.reason),
          dropped: resolved.dropped,
        },
        { status: 400 }
      );
    }

    const code = await allocateUniqueCode();
    const now = Date.now();
    const stored = toStoredLegs(resolved.legs);
    const doc: BookingCode = {
      id: code,
      legs: stored,
      totalOdds: resolved.totalOdds,
      createdAt: now,
    };

    await adminDb.collection("booking_codes").doc(code).set(doc);
    void securityLog({
      type: "BOOK_CODE",
      ip,
      meta: { code, legCount: stored.length, totalOdds: resolved.totalOdds },
    });

    return NextResponse.json({
      ok: true,
      code,
      totalOdds: resolved.totalOdds,
      legs: resolved.legs,
    });
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

  const resolved = await resolveBookingLegs(
    stored.map((l) => ({
      matchId: l.matchId,
      marketId: l.marketId,
      selectionId: l.selectionId,
      selectionLabel: l.selectionLabel,
      odds: l.odds,
    }))
  );

  if (resolved.legs.length === 0) {
    return NextResponse.json(
      {
        error:
          "All selections for this code have finished or are no longer available to bet.",
        details: resolved.dropped.map((d) => d.reason),
        dropped: resolved.dropped,
      },
      { status: 410 }
    );
  }

  return NextResponse.json({
    ok: true,
    booking: {
      id: booking.id,
      createdAt: booking.createdAt,
      legs: resolved.legs,
      totalOdds: resolved.totalOdds,
    },
    dropped: resolved.dropped,
    oddsChangedCount: resolved.oddsChangedCount,
    warning:
      resolved.dropped.length > 0 || resolved.oddsChangedCount > 0
        ? "Some selections were removed or odds updated"
        : undefined,
  });
}
