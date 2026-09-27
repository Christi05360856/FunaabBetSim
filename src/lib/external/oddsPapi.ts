/**
 * OddsPapi client (server-only).
 * Auth: ?apiKey= — free tier \~250 req/month.
 * Uses string concat (not template literals) so mobile editors can't break URLs.
 */

const BASE = "https://api.oddspapi.io/v4";
const SOCCER_SPORT_ID = 10;

function apiKey(): string {
  const k = process.env.ODDSPAPI_API_KEY;
  if (!k) throw new Error("ODDSPAPI_API_KEY is not set");
  return k;
}

async function opFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, apiKey: apiKey() });
  const url = BASE + path + "?" + q.toString();
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("OddsPapi " + res.status + ": " + body.slice(0, 240));
  }
  return res.json() as Promise<T>;
}

export type OpFixture = {
  fixtureId: string;
  startTime?: string;
  participant1Name?: string;
  participant2Name?: string;
  tournamentName?: string;
  tournamentSlug?: string;
  categoryName?: string;
};

export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc|club|de|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function namesClose(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let hit = 0;
  for (const t of ta) if (tb.has(t) && t.length > 2) hit++;
  return hit >= 1 && (hit >= 2 || Math.min(ta.size, tb.size) === 1);
}

export async function fetchSoccerFixtures(
  fromIso: string,
  toIso: string
): Promise<OpFixture[]> {
  const data = await opFetch<OpFixture[] | { fixtures?: OpFixture[] }>("/fixtures", {
    sportId: String(SOCCER_SPORT_ID),
    from: fromIso,
    to: toIso,
  });
  if (Array.isArray(data)) return data;
  return data.fixtures ?? [];
}

export function matchFixtureId(
  fixtures: OpFixture[],
  homeName: string,
  awayName: string,
  kickoffAt: number
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const f of fixtures) {
    const t = f.startTime ? new Date(f.startTime).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    const hours = Math.abs(t - kickoffAt) / (60 * 60 * 1000);
    if (hours > 6) continue;
    const p1 = f.participant1Name ?? "";
    const p2 = f.participant2Name ?? "";
    const homeAway = namesClose(p1, homeName) && namesClose(p2, awayName);
    const swapped = namesClose(p1, awayName) && namesClose(p2, homeName);
    if (!homeAway && !swapped) continue;
    const score = (homeAway ? 10 : 8) - hours;
    if (!best || score > best.score) best = { id: f.fixtureId, score };
  }
  return best?.id ?? null;
}

export type OneXTwo = { home: number; draw: number; away: number };

export async function fetch1x2(fixtureId: string): Promise<OneXTwo | null> {
  const data = await opFetch<Record<string, unknown>>("/odds", {
    fixtureId,
    oddsFormat: "decimal",
    bookmakers: "bet365,pinnacle,1xbet,williamhill",
  });

  const books = (data.bookmakerOdds ?? data) as Record<string, unknown>;
  if (!books || typeof books !== "object") return null;

  for (const book of Object.values(books)) {
    if (!book || typeof book !== "object") continue;
    const b = book as Record<string, unknown>;
    const markets = (b.markets ?? b) as Record<string, unknown>;
    if (!markets || typeof markets !== "object") continue;

    for (const m of Object.values(markets)) {
      if (!m || typeof m !== "object") continue;
      const market = m as Record<string, unknown>;
      const mType = String(market.marketType ?? market.type ?? "").toLowerCase();
      const is1x2 =
        mType.includes("1x2") ||
        mType === "match_winner" ||
        mType === "full_time_result" ||
        !mType;
      if (mType && !is1x2) continue;

      const triple = extract1x2FromOutcomes(market.outcomes ?? market.selections);
      if (triple) return triple;
    }
  }
  return null;
}

function asPrice(v: unknown): number | null {
  if (typeof v === "number" && v >= 1.01 && v < 100) return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["price", "odds", "decimal", "value"]) {
      const n = asPrice(o[k]);
      if (n) return n;
    }
    if (o["0"] !== undefined) return asPrice(o["0"]);
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (n >= 1.01 && n < 100) return n;
  }
  return null;
}

function extract1x2FromOutcomes(outcomes: unknown): OneXTwo | null {
  if (!outcomes) return null;
  let home: number | null = null;
  let draw: number | null = null;
  let away: number | null = null;

  const list = Array.isArray(outcomes)
    ? outcomes
    : typeof outcomes === "object"
      ? Object.values(outcomes as object)
      : [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(
      o.outcomeName ?? o.name ?? o.label ?? o.outcomeId ?? ""
    ).toLowerCase();
    const price =
      asPrice(o.price) ?? asPrice(o.odds) ?? asPrice(o.players) ?? asPrice(o);
    if (!price) continue;
    if (
      name === "1" ||
      name === "home" ||
      name.includes("home") ||
      name === "participant1"
    ) {
      home = price;
    } else if (name === "x" || name === "draw" || name.includes("draw")) {
      draw = price;
    } else if (
      name === "2" ||
      name === "away" ||
      name.includes("away") ||
      name === "participant2"
    ) {
      away = price;
    }
  }

  if (home && draw && away) return { home, draw, away };

  if (list.length >= 3) {
    const prices = list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return asPrice((item as Record<string, unknown>).price) ?? asPrice(item);
      })
      .filter((x): x is number => x != null);
    if (prices.length >= 3) {
      return { home: prices[0]!, draw: prices[1]!, away: prices[2]! };
    }
  }
  return null;
}

/** Neutral defaults if OddsPapi has no match / fails. */
export const DEFAULT_1X2: OneXTwo = { home: 2.1, draw: 3.3, away: 3.4 };
