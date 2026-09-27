import { adminDb } from "@/lib/firebase/admin";
import { deriveMarketsFromMatchWinner } from "@/lib/domain/oddsModel";
import type { Market, MarketType, Selection } from "@/types/domain";
import type { OneXTwo } from "@/lib/external/oddsPapi";

function marketDoc(
  matchId: string,
  type: MarketType,
  selections: Selection[],
  now: number
): Market {
  const id = `\( {matchId}_ \){type}`;
  return {
    id,
    matchId,
    type,
    status: "active",
    selections,
    createdAt: now,
    updatedAt: now,
  };
}

/** Write all standard markets from 1X2. Skips types that already exist. */
export async function writeMarketsFrom1x2(
  matchId: string,
  oneXTwo: OneXTwo,
  now = Date.now()
): Promise<{ written: string[] }> {
  const existing = await adminDb
    .collection("markets")
    .where("matchId", "==", matchId)
    .get();
  const have = new Set(existing.docs.map((d) => (d.data() as Market).type));

  const d = deriveMarketsFromMatchWinner(
    oneXTwo.home,
    oneXTwo.draw,
    oneXTwo.away
  );

  const written: string[] = [];
  const batch = adminDb.batch();
  let ops = 0;

  const add = (type: MarketType, selections: Selection[]) => {
    if (have.has(type)) return;
    const m = marketDoc(matchId, type, selections, now);
    batch.set(adminDb.collection("markets").doc(m.id), m);
    written.push(type);
    ops++;
  };

  add("match_winner", [
    { id: "home", label: "Home", odds: d.matchWinner.home },
    { id: "draw", label: "Draw", odds: d.matchWinner.draw },
    { id: "away", label: "Away", odds: d.matchWinner.away },
  ]);

  add("double_chance", [
    { id: "home_draw", label: "1X", odds: d.doubleChance.home_draw },
    { id: "home_away", label: "12", odds: d.doubleChance.home_away },
    { id: "draw_away", label: "X2", odds: d.doubleChance.draw_away },
  ]);

  add("draw_no_bet", [
    { id: "home", label: "Home", odds: d.drawNoBet.home },
    { id: "away", label: "Away", odds: d.drawNoBet.away },
  ]);

  add(
    "over_under",
    d.overUnder.flatMap((line) => [
      {
        id: `over_${line.line}`,
        label: `Over ${line.line}`,
        odds: line.over,
      },
      {
        id: `under_${line.line}`,
        label: `Under ${line.line}`,
        odds: line.under,
      },
    ])
  );

  add("both_teams_to_score", [
    { id: "yes", label: "Yes", odds: d.bothTeamsToScore.yes },
    { id: "no", label: "No", odds: d.bothTeamsToScore.no },
  ]);

  const csSelections: Selection[] = Object.entries(d.correctScore.scores).map(
    ([id, odds]) => ({ id, label: id.replace("-", "–"), odds })
  );
  csSelections.push(
    { id: "other_home", label: "Other home win", odds: d.correctScore.otherHome },
    { id: "other_away", label: "Other away win", odds: d.correctScore.otherAway },
    { id: "other_draw", label: "Other draw", odds: d.correctScore.otherDraw }
  );
  add("correct_score", csSelections);

  if (ops > 0) await batch.commit();
  return { written };
}

export async function matchHasAnyMarket(matchId: string): Promise<boolean> {
  const snap = await adminDb
    .collection("markets")
    .where("matchId", "==", matchId)
    .limit(1)
    .get();
  return !snap.empty;
}
