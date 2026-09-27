import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { deriveMarketsFromMatchWinner, CORRECT_SCORES } from "@/lib/domain/oddsModel";
import type { Market, MarketType, Selection } from "@/types/domain";

const bodySchema = z.object({
  entries: z
    .array(
      z.object({
        matchId: z.string().min(1),
        home: z.number().min(1.01).max(1000),
        draw: z.number().min(1.01).max(1000),
        away: z.number().min(1.01).max(1000),
      })
    )
    .min(1)
    .max(100),
});

// Same market shapes FixturesTab's "Generate every other market" button
// creates one match at a time — this just does it for many matches, and
// does it server-side (one request, not 6-per-match round trips).
async function createMarketsForMatch(
  matchId: string,
  home: number,
  draw: number,
  away: number
): Promise<{ created: number; skipped: number }> {
  const derived = deriveMarketsFromMatchWinner(home, draw, away);
  const now = Date.now();

  const toCreate: { type: MarketType; selections: Selection[] }[] = [
    {
      type: "match_winner",
      selections: [
        { id: "home", label: "Home", odds: derived.matchWinner.home },
        { id: "draw", label: "Draw", odds: derived.matchWinner.draw },
        { id: "away", label: "Away", odds: derived.matchWinner.away },
      ],
    },
    {
      type: "double_chance",
      selections: [
        { id: "home_draw", label: "1X", odds: derived.doubleChance.home_draw },
        { id: "home_away", label: "12", odds: derived.doubleChance.home_away },
        { id: "draw_away", label: "X2", odds: derived.doubleChance.draw_away },
      ],
    },
    {
      type: "draw_no_bet",
      selections: [
        { id: "home", label: "Home", odds: derived.drawNoBet.home },
        { id: "away", label: "Away", odds: derived.drawNoBet.away },
      ],
    },
    {
      type: "over_under",
      selections: derived.overUnder.flatMap(({ line, over, under }) => [
        { id: `over_${line}`, label: `Over ${line}`, odds: over },
        { id: `under_${line}`, label: `Under ${line}`, odds: under },
      ]),
    },
    {
      type: "both_teams_to_score",
      selections: [
        { id: "yes", label: "Yes", odds: derived.bothTeamsToScore.yes },
        { id: "no", label: "No", odds: derived.bothTeamsToScore.no },
      ],
    },
    {
      type: "correct_score",
      selections: [
        ...CORRECT_SCORES.map((id) => ({ id, label: id.replace("-", ":"), odds: derived.correctScore.scores[id]! })),
        { id: "other_home", label: "Any other home win", odds: derived.correctScore.otherHome },
        { id: "other_away", label: "Any other away win", odds: derived.correctScore.otherAway },
        { id: "other_draw", label: "Any other draw", odds: derived.correctScore.otherDraw },
      ],
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const { type, selections } of toCreate) {
    const existing = await adminDb
      .collection("markets")
      .where("matchId", "==", matchId)
      .where("type", "==", type)
      .limit(1)
      .get();
    if (!existing.empty) {
      skipped++;
      continue;
    }

    const ref = adminDb.collection("markets").doc();
    const market: Market = { id: ref.id, matchId, type, status: "active", selections, createdAt: now, updatedAt: now };
    await ref.set(market);
    created++;
  }

  return { created, skipped };
}

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

  let matchesProcessed = 0;
  let marketsCreated = 0;
  let marketsSkipped = 0;
  const errors: string[] = [];

  for (const entry of parsed.data.entries) {
    const matchSnap = await adminDb.collection("matches").doc(entry.matchId).get();
    if (!matchSnap.exists) {
      errors.push(`Match ${entry.matchId} not found`);
      continue;
    }
    const { created, skipped } = await createMarketsForMatch(entry.matchId, entry.home, entry.draw, entry.away);
    matchesProcessed++;
    marketsCreated += created;
    marketsSkipped += skipped;
  }

  return NextResponse.json({
    ok: true,
    message: `${matchesProcessed} match${matchesProcessed === 1 ? "" : "es"} · ${marketsCreated} markets created${marketsSkipped ? ` · ${marketsSkipped} already existed` : ""}${errors.length ? ` · ${errors.length} error(s)` : ""}`,
    matchesProcessed,
    marketsCreated,
    marketsSkipped,
    errors,
  });
}
