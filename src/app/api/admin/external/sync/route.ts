.import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import {
  competitionDocId,
  competitionName,
  FD_LEAGUES,
  fetchCompetitionMatches,
  mapFdStatusToOurs,
  matchDocId,
  teamDocId,
  type FdMatch,
} from "@/lib/external/footballData";
import {
  DEFAULT_1X2,
  fetch1x2,
  fetchSoccerFixtures,
  matchFixtureId,
  type OpFixture,
} from "@/lib/external/oddsPapi";
import {
  matchHasAnyMarket,
  writeMarketsFrom1x2,
} from "@/lib/domain/ensureExternalMarkets";
import type { Competition, Match, Team } from "@/types/domain";

/** Vercel serverless limit (Pro); Hobby may still cap lower. Sync one league at a time if needed. */
export const maxDuration = 60;

const ALL_CODES = FD_LEAGUES.map((l) => l.code) as string[];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function authorize(
  request: NextRequest,
  decoded: { uid: string } | null
): boolean {
  const cron = request.headers.get("x-external-sync-secret");
  if (
    cron &&
    process.env.EXTERNAL_SYNC_SECRET &&
    cron === process.env.EXTERNAL_SYNC_SECRET
  ) {
    return true;
  }
  return Boolean(decoded);
}

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request).catch(() => null);
  if (!authorize(request, decoded)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  // Optional: { "code": "PL" } or { "codes": ["PL","PD"] } — one league avoids timeouts
  let codes: string[] = ALL_CODES;
  if (typeof body.code === "string" && body.code.trim()) {
    codes = [body.code.trim().toUpperCase()];
  } else if (Array.isArray(body.codes) && body.codes.length > 0) {
    codes = body.codes.map((c: unknown) => String(c).trim().toUpperCase()).filter(Boolean);
  }
  const skipOdds = body.skipOdds === true;
  const oddsLimit = Math.min(
    30,
    Math.max(1, Number(body.oddsLimit) || 8)
  );

  const unknown = codes.filter((c) => !ALL_CODES.includes(c));
  if (unknown.length) {
    return NextResponse.json(
      {
        error: "Unknown league code(s): " + unknown.join(", "),
        allowed: ALL_CODES,
      },
      { status: 400 }
    );
  }

  const now = Date.now();
  const from = isoDate(new Date(now - 2 * 24 * 60 * 60 * 1000));
  const to = isoDate(new Date(now + 14 * 24 * 60 * 60 * 1000));

  const summary: {
    code: string;
    upserted: number;
    finished: number;
    errors: string[];
  }[] = [];

  for (const code of codes) {
    const errors: string[] = [];
    let upserted = 0;
    let finished = 0;

    try {
      const matches = await fetchCompetitionMatches(code, from, to);
      const compId = competitionDocId(code);
      const compName = competitionName(code);

      const compRef = adminDb.collection("competitions").doc(compId);
      const compSnap = await compRef.get();
      if (!compSnap.exists) {
        const competition: Competition = {
          id: compId,
          name: compName,
          providerCode: code,
          provider: "football-data",
          createdAt: now,
          updatedAt: now,
        };
        await compRef.set(competition);
      } else {
        await compRef.update({
          providerCode: code,
          provider: "football-data",
          updatedAt: now,
        });
      }

      for (const m of matches) {
        try {
          await upsertMatch(m, compId, now);
          upserted++;
          if (m.status === "FINISHED" || m.status === "AWARDED") {
            const didSettle = await maybeSettleExternal(m, now);
            if (didSettle) finished++;
          }
        } catch (e) {
          errors.push(
            "match " + m.id + ": " + (e instanceof Error ? e.message : "error")
          );
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "fetch failed");
    }

    summary.push({ code, upserted, finished, errors });
  }


  // Open betting on upcoming external matches in the leagues we just synced
  const compIdsForCodes = codes.map((c) => competitionDocId(c));
  try {
    const extOpenSnap = await adminDb
      .collection("matches")
      .where("source", "==", "external")
      .get();
    let opened = 0;
    for (const d of extOpenSnap.docs) {
      const m = d.data() as Match;
      if (!compIdsForCodes.includes(m.competitionId)) continue;
      if (m.status !== "scheduled") continue;
      if (m.kickoffAt <= now) continue;
      await d.ref.update({ status: "open", updatedAt: now });
      opened++;
    }
    if (opened) {
      summary.push({
        code: "_open",
        upserted: opened,
        finished: 0,
        errors: [],
      });
    }
  } catch (e) {
    /* non-fatal */
  }

  if (skipOdds) {
    return NextResponse.json({
      ok: true,
      skipOdds: true,
      codes,
      summary,
      message: "Fixtures synced (odds skipped). Run again without skipOdds to fill markets.",
    });
  }

  // ---- Odds: fill markets for external matches missing odds --------------
  let oddsFilled = 0;
  let oddsSkipped = 0;
  const oddsErrors: string[] = [];

  try {
    let opFixtures: OpFixture[] = [];
    if (process.env.ODDSPAPI_API_KEY) {
      try {
        const fromIso = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
        const toIso = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
        opFixtures = await fetchSoccerFixtures(fromIso, toIso);
      } catch (e) {
        oddsErrors.push(
          "OddsPapi fixtures: " + (e instanceof Error ? e.message : "fail")
        );
      }
    } else {
      oddsErrors.push("ODDSPAPI_API_KEY not set — using default 1X2");
    }

    const extSnap = await adminDb
      .collection("matches")
      .where("source", "==", "external")
      .get();

    const oddsCompIds = new Set(codes.map((c) => competitionDocId(c)));

    const teamCache = new Map<string, string>();

    for (const doc of extSnap.docs) {
      const match = { ...(doc.data() as Match), id: doc.id };
      if (!oddsCompIds.has(match.competitionId)) continue;
      if (
        match.status === "settled" ||
        match.status === "finished" ||
        match.status === "voided" ||
        match.status === "postponed"
      ) {
        continue;
      }
      if (oddsFilled >= oddsLimit) break;

      if (await matchHasAnyMarket(match.id)) {
        oddsSkipped++;
        continue;
      }

      try {
        let homeName = teamCache.get(match.homeTeamId);
        let awayName = teamCache.get(match.awayTeamId);
        if (!homeName) {
          const t = await adminDb
            .collection("teams")
            .doc(match.homeTeamId)
            .get();
          homeName =
            (t.data() as { name?: string } | undefined)?.name ?? "";
          teamCache.set(match.homeTeamId, homeName);
        }
        if (!awayName) {
          const t = await adminDb
            .collection("teams")
            .doc(match.awayTeamId)
            .get();
          awayName =
            (t.data() as { name?: string } | undefined)?.name ?? "";
          teamCache.set(match.awayTeamId, awayName);
        }

        let oneXTwo = DEFAULT_1X2;
        if (opFixtures.length > 0) {
          const fid = matchFixtureId(
            opFixtures,
            homeName,
            awayName,
            match.kickoffAt
          );
          if (fid) {
            try {
              const live = await fetch1x2(fid);
              if (live) oneXTwo = live;
            } catch (e) {
              oddsErrors.push(
                match.id +
                  " odds: " +
                  (e instanceof Error ? e.message : "fail")
              );
            }
          }
        }

        const { written } = await writeMarketsFrom1x2(match.id, oneXTwo, now);
        if (written.length) oddsFilled++;
      } catch (e) {
        oddsErrors.push(
          match.id + ": " + (e instanceof Error ? e.message : "odds fail")
        );
      }
    }
  } catch (e) {
    oddsErrors.push(e instanceof Error ? e.message : "odds batch failed");
  }

  return NextResponse.json({
    ok: true,
    from,
    to,
    summary,
    odds: { filled: oddsFilled, skipped: oddsSkipped, limit: oddsLimit, errors: oddsErrors },
  });
}

async function upsertMatch(m: FdMatch, competitionId: string, now: number) {
  const homeId = teamDocId(m.homeTeam.id);
  const awayId = teamDocId(m.awayTeam.id);

  await Promise.all([
    upsertTeam(homeId, m.homeTeam, now),
    upsertTeam(awayId, m.awayTeam, now),
  ]);

  const id = matchDocId(m.id);
  const ref = adminDb.collection("matches").doc(id);
  const existing = await ref.get();
  const status = mapFdStatusToOurs(m.status);
  const kickoffAt = new Date(m.utcDate).getTime();

  const ftHome = m.score.fullTime.home;
  const ftAway = m.score.fullTime.away;
  const isFinished = status === "finished" || status === "settled";

  if (existing.exists) {
    const prev = existing.data() as Match;
    if (prev.status === "settled") {
      return;
    }
  }

  const base: Partial<Match> = {
    id,
    competitionId,
    round: m.matchday,
    homeTeamId: homeId,
    awayTeamId: awayId,
    kickoffAt,
    status: isFinished && ftHome != null ? "finished" : status,
    venue: null,
    source: "external",
    sourceEventId: String(m.id),
    provider: "football-data",
    updatedAt: now,
  };

  if (status === "live" || status === "halftime") {
    base.currentHomeScore = ftHome ?? m.score.halfTime.home;
    base.currentAwayScore = ftAway ?? m.score.halfTime.away;
  }

  if (isFinished && ftHome != null && ftAway != null) {
    base.homeScore = ftHome;
    base.awayScore = ftAway;
    base.currentHomeScore = ftHome;
    base.currentAwayScore = ftAway;
  }

  if (!existing.exists) {
    // External fixtures: open for betting immediately if still upcoming
    const createStatus =
      base.status === "scheduled" && kickoffAt > now ? "open" : base.status;
    await ref.set({
      ...base,
      status: createStatus,
      homeScore: base.homeScore ?? null,
      awayScore: base.awayScore ?? null,
      currentHomeScore: base.currentHomeScore ?? null,
      currentAwayScore: base.currentAwayScore ?? null,
      createdAt: now,
    });
  } else {
    // Do not overwrite admin open/locked/live with scheduled on re-sync
    const prev = existing.data() as Match;
    const keepAdmin =
      prev.status === "open" ||
      prev.status === "locked" ||
      prev.status === "live" ||
      prev.status === "halftime" ||
      prev.status === "second_half" ||
      prev.status === "settled";
    if (keepAdmin) {
      const { status: _s, ...rest } = base;
      await ref.update(rest);
    } else {
      await ref.update(base);
    }
  }
}

async function upsertTeam(
  id: string,
  t: FdMatch["homeTeam"],
  now: number
) {
  const ref = adminDb.collection("teams").doc(id);
  const snap = await ref.get();
  const team: Team = {
    id,
    name: t.name,
    shortName: t.shortName || t.tla || t.name,
    logoUrl: t.crest || undefined,
    createdAt: snap.exists ? (snap.data() as Team).createdAt : now,
    updatedAt: now,
  };
  await ref.set(team, { merge: true });
}

async function maybeSettleExternal(m: FdMatch, now: number): Promise<boolean> {
  const home = m.score.fullTime.home;
  const away = m.score.fullTime.away;
  if (home == null || away == null) return false;

  const id = matchDocId(m.id);
  const ref = adminDb.collection("matches").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const match = snap.data() as Match;
  if (match.status === "settled") return false;

  await ref.update({
    homeScore: home,
    awayScore: away,
    currentHomeScore: home,
    currentAwayScore: away,
    status: "finished",
    updatedAt: now,
  });

  return true;
                  }

  
