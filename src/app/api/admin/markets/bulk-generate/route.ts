import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { deriveMarketsFromMatchWinner, CORRECT_SCORES } from "@/lib/domain/oddsModel";
import type { Market, MarketType, Selection } from "@/types/domain";

export const maxDuration = 60; // raise past Vercel's 10s default — this route does real work

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
// creates one match at a time — this does it for many matches at once,
// server-side, with every match and every market type running concurrently
// rather than one after another (that sequential version is what caused
// the 500s — too slow for Vercel's function time limit once you have more
// than a couple of matches).
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

  // All 6 existence-checks run concurrently instead of one after another —
  // this alone cuts a single match's processing time to roughly a sixth.
  const existing = await Promise.all(
    toCreate.map((m) =>
      adminDb
        .collection("markets")
        .where("matchId", "==", matchId)
        .where("type", "==", m.type)
        .limit(1)
        .get()
    )
  );

  const writes: Promise<unknown>[] = [];
  let created = 0;
  let skipped = 0;

  toCreate.forEach(({ type, selections }, i) => {
    if (!existing[i]!.empty) {
      skipped++;
      return;
    }
    const ref = adminDb.collection("markets").doc();
    const market: Market = {
      id: ref.id,
      matchId,
      type,
      status: "active",
      selections,
      createdAt: now,
      updatedAt: now,
    };
    writes.push(ref.set(market));
    created++;
  });

  await Promise.all(writes);
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

  // Every match is processed concurrently, and each match's own failure is
  // caught individually — one bad matchId can no longer take down the whole
  // batch or produce an opaque 500 for everything else in it.
  const results = await Promise.all(
    parsed.data.entries.map(async (entry) => {
      try {
        const matchSnap = await adminDb.collection("matches").doc(entry.matchId).get();
        if (!matchSnap.exists) {
          return { ok: false as const, error: `Match ${entry.matchId} not found` };
        }
        const { created, skipped } = await createMarketsForMatch(
          entry.matchId,
          entry.home,
          entry.draw,
          entry.away
        );
        return { ok: true as const, created, skipped };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : "Unknown error" };
      }
    })
  );

  const matchesProcessed = results.filter((r) => r.ok).length;
  const marketsCreated = results.reduce((sum, r) => sum + (r.ok ? r.created : 0), 0);
  const marketsSkipped = results.reduce((sum, r) => sum + (r.ok ? r.skipped : 0), 0);
  const errors = results.filter((r) => !r.ok).map((r) => (r as { error: string }).error);

  return NextResponse.json({
    ok: true,
    message: `${matchesProcessed}/${parsed.data.entries.length} matches · ${marketsCreated} markets created${
      marketsSkipped ? ` · ${marketsSkipped} already existed` : ""
    }${errors.length ? ` · ${errors.length} failed` : ""}`,
    matchesProcessed,
    marketsCreated,
    marketsSkipped,
    errors,
  });
}
