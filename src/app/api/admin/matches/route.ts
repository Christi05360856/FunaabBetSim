import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";

const bodySchema = z
  .object({
    competitionId: z.string().min(1),
    homeTeamId: z.string().min(1),
    awayTeamId: z.string().min(1),
    kickoffAt: z.number().int().positive(), // epoch ms
  })
  .refine((data) => data.homeTeamId !== data.awayTeamId, {
    message: "A team cannot play itself",
    path: ["awayTeamId"],
  });

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const { competitionId, homeTeamId, awayTeamId, kickoffAt } = parsed.data;

  const [competitionSnap, homeSnap, awaySnap] = await Promise.all([
    adminDb.collection("competitions").doc(competitionId).get(),
    adminDb.collection("teams").doc(homeTeamId).get(),
    adminDb.collection("teams").doc(awayTeamId).get(),
  ]);

  if (!competitionSnap.exists) {
    return NextResponse.json({ error: "Competition not found" }, { status: 400 });
  }
  if (!homeSnap.exists || !awaySnap.exists) {
    return NextResponse.json({ error: "Home or away team not found" }, { status: 400 });
  }

  const now = Date.now();
  const ref = adminDb.collection("matches").doc();
  await ref.set({
    id: ref.id,
    competitionId,
    round: null,
    homeTeamId,
    awayTeamId,
    kickoffAt,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    currentHomeScore: null,
    currentAwayScore: null,
    venue: null,
    source: "manual",
    sourceEventId: null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id });
}
