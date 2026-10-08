import { NextResponse, type NextRequest } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import {
  resolveBookingLegs,
  type RawLegInput,
} from "@/lib/domain/resolveBookingLegs";

/**
 * POST /api/bets/revalidate
 * Rebuild a slip from prior ticket legs with live server odds.
 * Does not place a bet — client must confirm a NEW placement.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limited = await enforceRateLimit("book_code", `reval:${ip}`);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const { legs: rawLegs } = body as { legs?: RawLegInput[] };

  if (!rawLegs || !Array.isArray(rawLegs) || rawLegs.length === 0) {
    return NextResponse.json(
      { error: "No selections to revalidate" },
      { status: 400 }
    );
  }
  if (rawLegs.length > 20) {
    return NextResponse.json(
      { error: "Too many selections" },
      { status: 400 }
    );
  }

  try {
    const resolved = await resolveBookingLegs(rawLegs);

    if (resolved.legs.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of these selections are still available to bet. Matches may have started or settled.",
          dropped: resolved.dropped,
          details: resolved.dropped.map((d) => d.reason),
        },
        { status: 410 }
      );
    }

    return NextResponse.json({
      ok: true,
      legs: resolved.legs,
      totalOdds: resolved.totalOdds,
      dropped: resolved.dropped,
      oddsChangedCount: resolved.oddsChangedCount,
      warning:
        resolved.dropped.length > 0 || resolved.oddsChangedCount > 0
          ? "Some selections were removed or odds updated — review before placing"
          : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not revalidate selections" },
      { status: 500 }
    );
  }
}
