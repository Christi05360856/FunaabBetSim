import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type { Match, Team, Competition, Market } from "@/types/domain";

export const dynamic = "force-dynamic";

// Keep recently-started matches visible (live / awaiting settlement),
// then everything upcoming, nearest first, capped for read-cost safety.
const HOURS_BACK = 24;
const MAX_MATCHES = 150;

const getMatches = unstable_cache(
  async (): Promise<Match[]> => {
    const now = Date.now();
    const snap = await adminDb
      .collection("matches")
      .where("kickoffAt", ">=", now - HOURS_BACK * 3_600_000)
      .orderBy("kickoffAt")
      .limit(MAX_MATCHES)
      .get();
    return snap.docs.map((d) => d.data() as Match);
  },
  ["fixtures-matches-v2"],
  { revalidate: 60, tags: ["fixtures-core"] }
);

const getStatic = unstable_cache(
  async () => {
    const [t, c] = await Promise.all([
      adminDb.collection("teams").get(),
      adminDb.collection("competitions").get(),
    ]);
    return {
      teams: t.docs.map((d) => d.data() as Team),
      competitions: c.docs.map((d) => d.data() as Competition),
    };
  },
  ["fixtures-static"],
  { revalidate: 3600, tags: ["fixtures-static"] }
);

function getMarkets(matchId: string): Promise<Market[]> {
  return unstable_cache(
    async (): Promise<Market[]> => {
      const snap = await adminDb
        .collection("markets")
        .where("matchId", "==", matchId)
        .get();
      return snap.docs.map((d) => d.data() as Market);
    },
    ["fixtures-markets", matchId],
    { revalidate: 3600, tags: ["markets"] }
  )();
}

export async function GET() {
  try {
    const [matches, stat] = await Promise.all([getMatches(), getStatic()]);
    const marketLists = await Promise.all(matches.map((m) => getMarkets(m.id)));

    return NextResponse.json(
      {
        matches,
        teams: stat.teams,
        competitions: stat.competitions,
        markets: marketLists.flat(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
        },
      }
    );
  } catch (e) {
    console.error("fixtures api failed", e);
    return NextResponse.json(
      { error: "Failed to load fixtures" },
      { status: 500 }
    );
  }
}
