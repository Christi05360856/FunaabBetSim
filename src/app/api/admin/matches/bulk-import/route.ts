import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { bulkImportSchema } from "@/lib/validation/schemas";
import type { Competition, Match, Team } from "@/types/domain";

function makeShortName(name: string, taken: Set<string>): string {
  const words = name.trim().split(/\s+/);
  const initials = words.map((w) => w[0]).join("").toUpperCase();
  const candidates = [
    initials.slice(0, 4),
    name.replace(/\s+/g, "").slice(0, 3).toUpperCase(),
    name.replace(/\s+/g, "").slice(0, 4).toUpperCase(),
  ];
  for (const candidate of candidates) {
    if (candidate && !taken.has(candidate)) return candidate;
  }
  const base = candidates[0] || "TM";
  let n = 2;
  while (taken.has(`\( {base} \){n}`)) n++;
  return `\( {base} \){n}`;
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bulkImportSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { competitionName, matches } = parsed.data;
  const now = Date.now();

  // ---- Step 1: find or create the competition (exact-name match) ------------
  const competitionQuery = await adminDb
    .collection("competitions")
    .where("name", "==", competitionName)
    .limit(1)
    .get();

  let competitionId: string;
  if (!competitionQuery.empty) {
    competitionId = competitionQuery.docs[0]!.id;
  } else {
    const ref = adminDb.collection("competitions").doc();
    const competition: Competition = { id: ref.id, name: competitionName, createdAt: now, updatedAt: now };
    await ref.set(competition);
    competitionId = ref.id;
  }

  // ---- Step 2: find or create every team referenced -------------------------
  const teamNames = Array.from(new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam])));
  const existingTeamsSnap = await adminDb.collection("teams").get();
  const teamIdByName = new Map<string, string>();
  const takenShortNames = new Set<string>();
  existingTeamsSnap.docs.forEach((d) => {
    const team = d.data() as Team;
    teamIdByName.set(team.name, team.id);
    takenShortNames.add(team.shortName);
  });

  let teamsCreated = 0;
  for (const name of teamNames) {
    if (teamIdByName.has(name)) continue;
    const shortName = makeShortName(name, takenShortNames);
    takenShortNames.add(shortName);
    const ref = adminDb.collection("teams").doc();
    const team: Team = { id: ref.id, name, shortName, createdAt: now, updatedAt: now };
    await ref.set(team);
    teamIdByName.set(name, ref.id);
    teamsCreated++;
  }

  // ---- Step 3: create matches, skipping exact duplicates --------------------
  let matchesCreated = 0;
  let matchesSkipped = 0;
  for (const m of matches) {
    const homeTeamId = teamIdByName.get(m.homeTeam)!;
    const awayTeamId = teamIdByName.get(m.awayTeam)!;

    const dupeSnap = await adminDb
      .collection("matches")
      .where("competitionId", "==", competitionId)
      .where("homeTeamId", "==", homeTeamId)
      .where("awayTeamId", "==", awayTeamId)
      .where("kickoffAt", "==", m.kickoffAt)
      .limit(1)
      .get();
    if (!dupeSnap.empty) {
      matchesSkipped++;
      continue;
    }

    const ref = adminDb.collection("matches").doc();
    const match: Match = {
      id: ref.id,
      competitionId,
      round: null,
      homeTeamId,
      awayTeamId,
      kickoffAt: m.kickoffAt,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      currentHomeScore: null,
      currentAwayScore: null,
      venue: null,
      source: "bulk_import",
      sourceEventId: null,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(match);
    matchesCreated++;
  }

  return NextResponse.json({ ok: true, teamsCreated, matchesCreated, matchesSkipped });
}
