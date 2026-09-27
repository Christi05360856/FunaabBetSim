import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { BetLeg, BookingCode } from "@/types/domain";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "FB-" + code;
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
  const code = searchParams.get("code")?.toUpperCase().trim();

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

  return NextResponse.json({ ok: true, booking: snap.data() });
}
