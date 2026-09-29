import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  deriveMarketsFromMatchWinner,
  CORRECT_SCORES,
} from "@/lib/domain/oddsModel";

import type { Market, MarketType, Selection } from "@/types/domain";

export const maxDuration = 60;

/* ------------------------------- SCHEMA ---------------------------------- */

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

/* --------------------------- MATCH RESOLUTION ---------------------------- */

/**
 * Resolves a match by Firestore document ID, or by the `id` field stored
 * inside the match document.
 */
async function resolveMatch(matchId: string) {
  const matchesRef = adminDb.collection("matches");

  const directSnap = await matchesRef.doc(matchId).get();
  if (directSnap.exists) return directSnap;

  const byStoredId = await matchesRef
    .where("id", "==", matchId)
    .limit(1)
    .get();
  if (!byStoredId.empty) return byStoredId.docs[0]!;

  return null;
}

/* --------------------------- MARKET GENERATION --------------------------- */

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
        ...CORRECT_SCORES.map((id) => ({
          id,
          label: id.replace("-", ":"),
          odds: derived.correctScore.scores[id]!,
        })),
        {
          id: "other_home",
          label: "Any other home win",
          odds: derived.correctScore.otherHome,
        },
        {
          id: "other_away",
          label: "Any other away win",
          odds: derived.correctScore.otherAway,
        },
        {
          id: "other_draw",
          label: "Any other draw",
          odds: derived.correctScore.otherDraw,
        },
      ],
    },
  ];

  /* One query for all existing markets of this match (instead of 6). */
  const existingSnap = await adminDb
    .collection("markets")
    .where("matchId", "==", matchId)
    .get();

  const existingTypes = new Set(
    existingSnap.docs.map((d) => (d.data() as Market).type)
  );

  const batch = adminDb.batch();
  let created = 0;
  let skipped = 0;

  for (const { type, selections } of toCreate) {
    if (existingTypes.has(type)) {
      skipped++;
      continue;
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

    batch.set(ref, market);
    created++;
  }

  if (created > 0) await batch.commit();

  return { created, skipped };
}

/* --------------------------------- POST ---------------------------------- */

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);

  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => ({}))
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    parsed.data.entries.map(async (entry) => {
      try {
        const matchSnap = await resolveMatch(entry.matchId);

        if (!matchSnap) {
          return {
            ok: false as const,
            error: `Match ${entry.matchId} not found in matches collection`,
          };
        }

        /*
         * Keep using entry.matchId for the market's matchId (do NOT swap it
         * for matchSnap.id) so it stays consistent with existing markets.
         */
        const { created, skipped } = await createMarketsForMatch(
          entry.matchId,
          entry.home,
          entry.draw,
          entry.away
        );

        return { ok: true as const, created, skipped };
      } catch (error) {
        console.error("bulk-generate failed for", entry.matchId, error);
        return {
          ok: false as const,
          error: `${entry.matchId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    })
  );

  /* -------------------------------- SUMMARY -------------------------------- */

  const matchesProcessed = results.filter((r) => r.ok).length;

  const marketsCreated = results.reduce(
    (sum, r) => sum + (r.ok ? r.created : 0),
    0
  );

  const marketsSkipped = results.reduce(
    (sum, r) => sum + (r.ok ? r.skipped : 0),
    0
  );

  const errors = results
    .filter((r) => !r.ok)
    .map((r) => (r as { error: string }).error);

  /* If nothing worked, report a real failure with the actual reason. */
  if (matchesProcessed === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `All ${parsed.data.entries.length} failed. First error: ${errors[0] ?? "unknown"}`,
        errors,
      },
      { status: 500 }
    );
  }

  /* Make the cached fixtures API pick up the new odds straight away. */
  if (marketsCreated > 0) {
    revalidateTag("markets");
  }

  return NextResponse.json({
    ok: true,
    message:
      `${matchesProcessed}/${parsed.data.entries.length} matches · ` +
      `${marketsCreated} markets created` +
      (marketsSkipped ? ` · ${marketsSkipped} already existed` : "") +
      (errors.length ? ` · ${errors.length} failed` : ""),
    matchesProcessed,
    marketsCreated,
    marketsSkipped,
    errors,
  });
}
