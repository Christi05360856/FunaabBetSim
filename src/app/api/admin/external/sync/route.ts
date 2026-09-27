import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import {
  competitionDocId,
  fetchCompetitionMatches,
  mapFdStatusToOurs,
  matchDocId,
  teamDocId,
  type FdMatch,
} from "@/lib/external/footballData";
import type { Competition, Match, Team } from "@/types/domain";

const CODES = ["PL", "PD"] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function authorize(request: NextRequest, decoded: { uid: string } | null): boolean {
  const cron = request.headers.get("x-external-sync-secret");
  if (cron && process.env.EXTERNAL_SYNC_SECRET && cron === process.env.EXTERNAL_SYNC_SECRET) {
    return true;
  }
  // Fallback: any authenticated admin (extend if you store role on user)
  return Boolean(decoded);
}

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request).catch(() => null);
  if (!authorize(request, decoded)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const from = isoDate(new Date(now - 2 * 24 * 60 * 60 * 1000)); // 2 days back (FT catch-up)
  const to = isoDate(new Date(now + 14 * 24 * 60 * 60 * 1000)); // 14 days ahead

  const summary: {
    code: string;
    upserted: number;
    finished: number;
    errors: string[];
  }[] = [];

  for (const code of CODES) {
    const errors: string[] = [];
    let upserted = 0;
    let finished = 0;

    try {
      const matches = await fetchCompetitionMatches(code, from, to);
      const compId = competitionDocId(code);
      const compName = code === "PL" ? "Premier League" : "La Liga";

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

  return NextResponse.json({ ok: true, from, to, summary });
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

  // Never overwrite a match already fully settled by us
  if (existing.exists) {
    const prev = existing.data() as Match;
    if (prev.status === "settled") {
      // Still allow live score refresh only if not settled — skip
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
    await ref.set({
      ...base,
      homeScore: base.homeScore ?? null,
      awayScore: base.awayScore ?? null,
      currentHomeScore: base.currentHomeScore ?? null,
      currentAwayScore: base.currentAwayScore ?? null,
      createdAt: now,
    });
  } else {
    await ref.update(base);
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

/**
 * When FT is known and match not yet settled, call the same settle path
 * you use in admin (import your settle helper if extracted).
 * For v1: mark finished + scores; trigger settle via internal call.
 */
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

  // Write FT first
  await ref.update({
    homeScore: home,
    awayScore: away,
    currentHomeScore: home,
    currentAwayScore: away,
    status: "finished",
    updatedAt: now,
  });

  // Reuse admin settle by invoking shared logic if you have it.
  // Minimal: set result_confirmed and leave settle to existing admin route
  // OR POST internally to settle. Prefer extracting settleMatch(matchId).
  try {
    const { settleMatchById } = await import("@/lib/domain/settleMatch");
    await settleMatchById(id);
    return true;
  } catch {
    // settle helper may not exist yet — match stays "finished" for admin settle
    return false;
  }
}
