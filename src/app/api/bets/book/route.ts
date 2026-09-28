import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { BetLeg, BookingCode, Match } from "@/types/domain";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "FB-" + code;
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
  const body = await request.json().catch(() => ({}));
  const { legs } = body as { legs?: BetLeg[] };

  if (!legs || !Array.isArray(legs) || legs.length === 0) {
    return NextResponse.json(
      { error: "No selections provided to book" },
      { status: 400 }
    );
  }

  const code = generateCode();
  const totalOdds = legs.reduce((acc, l) => acc * (l.odds || 1), 1);
  const now = Date.now();

  const doc: BookingCode = {
    id: code,
    legs,
    totalOdds,
    createdAt: now,
  };

  await adminDb.collection("booking_codes").doc(code).set(doc);

  return NextResponse.json({ ok: true, code, totalOdds });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code")?.trim() ?? "";
  const code = raw.toUpperCase();

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

  return NextResponse.json({ ok: true, booking });
}
