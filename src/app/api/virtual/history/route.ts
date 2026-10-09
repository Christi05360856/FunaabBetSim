import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { buildRoundByIndex } from "@/lib/virtual/currentRound";
import { phaseAt, VIRTUAL_SEASON_ROUNDS } from "@/lib/virtual/schedule";
import type { VirtualStanding } from "@/types/virtual";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const cur = phaseAt(now);
  const history: Array<{
    index: number;
    id: string;
    results: NonNullable<ReturnType<typeof buildRoundByIndex>["public"]["results"]>;
    matches: Array<{ id: string; home: string; away: string; league: string }>;
  }> = [];

  const table = new Map<string, VirtualStanding>();

  for (let i = 1; i <= VIRTUAL_SEASON_ROUNDS; i++) {
    const idx = cur.index - i;
    if (idx < 0) break;
    const built = buildRoundByIndex(idx, now);
    if (!built.public.results) continue;
    history.push({
      index: idx,
      id: built.public.id,
      results: built.public.results,
      matches: built.internal.map((m) => ({
        id: m.id,
        home: m.home,
        away: m.away,
        league: m.league,
      })),
    });
    for (const m of built.internal) {
      const res = built.public.results.find((r) => r.matchId === m.id);
      if (!res) continue;
      for (const [team, gf, ga, w, d, l] of [
        [
          m.home,
          res.homeGoals,
          res.awayGoals,
          res.homeGoals > res.awayGoals ? 1 : 0,
          res.homeGoals === res.awayGoals ? 1 : 0,
          res.homeGoals < res.awayGoals ? 1 : 0,
        ],
        [
          m.away,
          res.awayGoals,
          res.homeGoals,
          res.awayGoals > res.homeGoals ? 1 : 0,
          res.awayGoals === res.homeGoals ? 1 : 0,
          res.awayGoals < res.homeGoals ? 1 : 0,
        ],
      ] as const) {
        const row = table.get(team) ?? {
          team,
          league: m.league,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          pts: 0,
        };
        row.played += 1;
        row.won += w as number;
        row.drawn += d as number;
        row.lost += l as number;
        row.gf += gf as number;
        row.ga += ga as number;
        row.pts += (w as number) * 3 + (d as number);
        table.set(team, row);
      }
    }
  }

  const standings = [...table.values()].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });

  return NextResponse.json({
    ok: true,
    history: history.slice(0, 10),
    standings: standings.slice(0, 40),
  });
}
