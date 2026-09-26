"use client";

import { useEffect, useMemo, useState } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { auth } from "@/lib/firebase/client";
import { Card, Badge, Button, Input, Select, Modal, ConfirmModal, EmptyState } from "./ui";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  competitionName,
  displayScore,
  fixtureGroup,
  formatKickoff,
  isFinal,
  isInPlay,
  sortFixtures,
  teamName,
  useNow,
} from "./helpers";

type PostResult = { ok: boolean; message: string };
type ConfirmType = "open" | "close" | "settle" | "void" | "delete" | "reopen";
export type FixtureFilter = "all" | "active" | "final" | "open" | "live" | "scheduled" | "settled";

const ENDPOINTS: Record<ConfirmType, string> = {
  open: "/api/admin/matches/open",
  close: "/api/admin/matches/close",
  settle: "/api/admin/matches/settle",
  void: "/api/admin/matches/void",
  delete: "/api/admin/matches/delete",
  reopen: "/api/admin/matches/reopen",
};

const SUCCESS: Record<ConfirmType, string> = {
  open: "Betting opened",
  close: "Betting closed",
  settle: "Match settled",
  void: "Match voided",
  delete: "Fixture deleted",
  reopen: "Match reopened",
};

const isValidScore = (s: string) => /^\d{1,2}$/.test(s);

// ---- Inline "Add Market" form -----------------------------------------------
const OU_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];

// Standard grid an admin can offer Correct Score odds for, plus three
// "any other" catch-all buckets so a scoreline outside the grid (5-3, 6-0,
// 7-1…) still has somewhere to settle. Ids use "H-A" to match exactly what
// settle/route.ts's resolveCorrectScoreOutcome() produces from the final score.
const CORRECT_SCORES = [
  "1-0", "2-0", "2-1", "3-0", "3-1", "3-2", "4-0", "4-1", "4-2", "4-3",
  "0-0", "1-1", "2-2", "3-3", "4-4",
  "0-1", "0-2", "1-2", "0-3", "1-3", "2-3", "0-4", "1-4", "2-4", "3-4",
];

type MarketTypeChoice = "match_winner" | "over_under" | "double_chance" | "draw_no_bet" | "both_teams_to_score" | "correct_score";

function marketConfigFor(marketType: MarketTypeChoice) {
  switch (marketType) {
    case "match_winner":
      return {
        selections: [
          { id: "home", label: "Home", defaultOdds: "2.00" },
          { id: "draw", label: "Draw", defaultOdds: "3.20" },
          { id: "away", label: "Away", defaultOdds: "3.50" },
        ],
      };
    case "double_chance":
      return {
        selections: [
          { id: "home_draw", label: "1X", defaultOdds: "1.30" },
          { id: "home_away", label: "12", defaultOdds: "1.25" },
          { id: "draw_away", label: "X2", defaultOdds: "1.40" },
        ],
      };
    case "draw_no_bet":
      return {
        selections: [
          { id: "home", label: "Home", defaultOdds: "1.80" },
          { id: "away", label: "Away", defaultOdds: "2.10" },
        ],
      };
    case "over_under":
      return {
        selections: [
          { id: "over", label: "Over", defaultOdds: "1.90" },
          { id: "under", label: "Under", defaultOdds: "1.90" },
        ],
      };
    case "both_teams_to_score":
      return {
        selections: [
          { id: "yes", label: "Yes", defaultOdds: "1.80" },
          { id: "no", label: "No", defaultOdds: "1.90" },
        ],
      };
    case "correct_score":
      return {
        selections: [
          ...CORRECT_SCORES.map((score) => ({ id: score, label: score.replace("-", ":"), defaultOdds: "9.00" })),
          { id: "other_home", label: "Any other home win", defaultOdds: "15.00" },
          { id: "other_away", label: "Any other away win", defaultOdds: "17.00" },
          { id: "other_draw", label: "Any other draw", defaultOdds: "21.00" },
        ],
      };
  }
}

// Simple, standalone starting-point odds per goal line — Over/Under can't be
// derived from 1X2 odds (they answer different questions: who wins vs. total
// goals), so these are just a reasonable default an admin can tweak, not a
// calculation off the 1X2 prices.
const OU_DEFAULTS: Record<number, { over: string; under: string }> = {
  0.5: { over: "1.25", under: "3.80" },
  1.5: { over: "1.55", under: "2.40" },
  2.5: { over: "1.90", under: "1.90" },
  3.5: { over: "2.60", under: "1.45" },
  4.5: { over: "3.60", under: "1.22" },
};

// Double Chance and Draw No Bet, unlike Over/Under, genuinely are just a
// recombination of the same three win/draw/loss probabilities as 1X2 — so
// these are a real derivation, not a guess.
function deriveFromMatchWinner(homeOdds: number, drawOdds: number, awayOdds: number) {
  const pHome = 1 / homeOdds;
  const pDraw = 1 / drawOdds;
  const pAway = 1 / awayOdds;
  const round2 = (n: number) => Math.min(1000, Math.max(1.01, Math.round(n * 100) / 100));
  return {
    doubleChance: {
      home_draw: round2(1 / (pHome + pDraw)),
      home_away: round2(1 / (pHome + pAway)),
      draw_away: round2(1 / (pDraw + pAway)),
    },
    drawNoBet: {
      home: round2(1 / (pHome / (pHome + pAway))),
      away: round2(1 / (pAway / (pHome + pAway))),
    },
  };
}

function MarketCreator({ matchId, onCreated }: { matchId: string; onCreated: () => void }) {
  const [marketType, setMarketType] = useState<MarketTypeChoice>("match_winner");
  const [line, setLine] = useState<number>(2.5);
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const config = marketConfigFor(marketType);

  async function postMarket(type: MarketTypeChoice, selections: { id: string; label: string; odds: number }[], marketLine?: number) {
    const idToken = await auth.currentUser?.getIdToken();
    const body: Record<string, unknown> = { matchId, type, selections };
    if (type === "over_under" && marketLine !== undefined) body.line = marketLine;
    const response = await fetch("/api/admin/markets", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to create market");
    return data;
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const selections = config.selections.map((s) => ({
        id: s.id,
        label: s.label,
        odds: parseFloat(odds[s.id] || s.defaultOdds),
      }));
      await postMarket(marketType, selections, marketType === "over_under" ? line : undefined);
      setStatus(
        marketType === "over_under"
          ? `${line} goals market created — pick another line or market type to keep going.`
          : "Market created — pick another market type to keep going."
      );
      setOdds({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create market");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateFromMatchWinner() {
    const homeOdds = parseFloat(odds.home || config.selections[0]?.defaultOdds || "");
    const drawOdds = parseFloat(odds.draw || config.selections[1]?.defaultOdds || "");
    const awayOdds = parseFloat(odds.away || config.selections[2]?.defaultOdds || "");
    if (!homeOdds || !drawOdds || !awayOdds) {
      setError("Enter Home, Draw and Away odds first.");
      return;
    }
    setGenerating(true);
    setError(null);
    setStatus(null);
    const results: string[] = [];

    async function attempt(label: string, fn: () => Promise<unknown>) {
      try {
        await fn();
        results.push(`${label} ✓`);
      } catch (err) {
        results.push(`${label} — ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    await attempt("Match Winner", () =>
      postMarket("match_winner", [
        { id: "home", label: "Home", odds: homeOdds },
        { id: "draw", label: "Draw", odds: drawOdds },
        { id: "away", label: "Away", odds: awayOdds },
      ])
    );

    const derived = deriveFromMatchWinner(homeOdds, drawOdds, awayOdds);

    await attempt("Double Chance", () =>
      postMarket("double_chance", [
        { id: "home_draw", label: "1X", odds: derived.doubleChance.home_draw },
        { id: "home_away", label: "12", odds: derived.doubleChance.home_away },
        { id: "draw_away", label: "X2", odds: derived.doubleChance.draw_away },
      ])
    );

    await attempt("Draw No Bet", () =>
      postMarket("draw_no_bet", [
        { id: "home", label: "Home", odds: derived.drawNoBet.home },
        { id: "away", label: "Away", odds: derived.drawNoBet.away },
      ])
    );

    for (const l of OU_LINES) {
      const d = OU_DEFAULTS[l]!;
      await attempt(`Over/Under ${l}`, () =>
        postMarket(
          "over_under",
          [
            { id: "over", label: "Over", odds: parseFloat(d.over) },
            { id: "under", label: "Under", odds: parseFloat(d.under) },
          ],
          l
        )
      );
    }

    setGenerating(false);
    setStatus(results.join(" · "));
    onCreated();
  }

  return (
    <div className="mt-3 rounded-lg bg-adm-raised p-3">
      <p className="mb-2 text-sm font-semibold">Add Market</p>

      <div className="mb-3 flex gap-2">
        <Select
          value={marketType}
          onChange={(e) => {
            setMarketType(e.target.value as MarketTypeChoice);
            setOdds({});
            setStatus(null);
            setError(null);
          }}
          className="flex-1"
        >
          <option value="match_winner">Match Winner (1X2)</option>
          <option value="over_under">Over/Under</option>
          <option value="double_chance">Double Chance</option>
          <option value="draw_no_bet">Draw No Bet</option>
          <option value="both_teams_to_score">Both Teams to Score</option>
          <option value="correct_score">Correct Score</option>
        </Select>

        {marketType === "over_under" && (
          <Select value={line} onChange={(e) => setLine(Number(e.target.value))} className="w-28">
            {OU_LINES.map((l) => (
              <option key={l} value={l}>{l} goals</option>
            ))}
          </Select>
        )}
      </div>

      {marketType === "match_winner" && (
        <p className="mb-2 text-xs text-adm-muted">
          Fill these three in, then use "Generate other markets" below to auto-create Double Chance, Draw No Bet and all five Over/Under lines from them.
        </p>
      )}

      <div className={`mb-3 grid gap-2 ${marketType === "correct_score" ? "grid-cols-3" : "grid-cols-2"}`}>
        {config.selections.map((s) => (
          <div key={s.id}>
            <label className="text-xs text-adm-muted">{s.label}</label>
            <Input
              type="number"
              step="0.01"
              min="1.01"
              value={odds[s.id] || s.defaultOdds}
              onChange={(e) => setOdds((prev) => ({ ...prev, [s.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {error && <p className="mb-2 text-sm text-adm-bad">{error}</p>}
      {status && <p className="mb-2 text-sm text-adm-ok">{status}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCreate} disabled={submitting || generating} className="flex-1">
          {submitting ? "Creating…" : "Create Market"}
        </Button>
        {marketType === "match_winner" && (
          <Button variant="secondary" onClick={handleGenerateFromMatchWinner} disabled={submitting || generating} className="flex-1">
            {generating ? "Generating…" : "Generate other markets"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---- Inline live-score editor (in-play matches only) ------------------------
function LiveScoreEditor({
  match,
  homeLabel,
  awayLabel,
  onAction,
}: {
  match: Match;
  homeLabel: string;
  awayLabel: string;
  onAction: (path: string, body: unknown, successMessage?: string) => Promise<PostResult>;
}) {
  const [home, setHome] = useState(String(match.currentHomeScore ?? 0));
  const [away, setAway] = useState(String(match.currentAwayScore ?? 0));
  const [phase, setPhase] = useState<"live" | "halftime" | "second_half">(
    match.status === "halftime" || match.status === "second_half" ? match.status : "live"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHome(String(match.currentHomeScore ?? 0));
    setAway(String(match.currentAwayScore ?? 0));
    if (match.status === "halftime" || match.status === "second_half" || match.status === "live") {
      setPhase(match.status);
    }
  }, [match.currentHomeScore, match.currentAwayScore, match.status]);

  async function save() {
    if (!isValidScore(home) || !isValidScore(away)) return;
    setBusy(true);
    await onAction(
      "/api/admin/matches/live-score",
      { matchId: match.id, homeScore: Number(home), awayScore: Number(away), status: phase },
      "Live score updated"
    );
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-adm-line bg-adm-raised/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-adm-faint">Live score</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">{homeLabel}</span>
          <Input type="number" inputMode="numeric" min={0} max={99} value={home} onChange={(e) => setHome(e.target.value)} className="w-16 text-center" />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">{awayLabel}</span>
          <Input type="number" inputMode="numeric" min={0} max={99} value={away} onChange={(e) => setAway(e.target.value)} className="w-16 text-center" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={phase} onChange={(e) => setPhase(e.target.value as typeof phase)} className="w-auto">
          <option value="live">Live</option>
          <option value="halftime">Halftime</option>
          <option value="second_half">2nd half</option>
        </Select>
        <Button size="sm" onClick={save} disabled={busy || !isValidScore(home) || !isValidScore(away)}>
          {busy ? "Saving…" : "Update score"}
        </Button>
      </div>
    </div>
  );
}

export default function FixturesTab({
  matches,
  teamsById,
  competitionsById,
  onAction,
  initialFilter = "all",
}: {
  matches: Match[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onAction: (path: string, body: unknown, successMessage?: string) => Promise<PostResult>;
  initialFilter?: FixtureFilter;
}) {
  const now = useNow();
  const [filter, setFilter] = useState<FixtureFilter>(initialFilter);
  const [competitionId, setCompetitionId] = useState("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ type: ConfirmType; match: Match } | null>(null);
  const [scores, setScores] = useState({ home: "", away: "" });
  const [busy, setBusy] = useState(false);
  const [marketOpenIds, setMarketOpenIds] = useState<Set<string>>(new Set());
  const [liveOpenIds, setLiveOpenIds] = useState<Set<string>>(new Set());

  // When Overview navigates here with a filter, adopt it.
  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  function toggleMarketForm(matchId: string) {
    setMarketOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }

  function toggleLiveForm(matchId: string) {
    setLiveOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }

  const competitionOptions = useMemo(
    () => Object.values(competitionsById).sort((a, b) => a.name.localeCompare(b.name)),
    [competitionsById]
  );

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = sortFixtures(matches, now).filter((m) => {
      if (filter === "active" && isFinal(m)) return false;
      if (filter === "final" && !isFinal(m)) return false;
      if (filter === "open" && m.status !== "open") return false;
      if (filter === "live" && !isInPlay(m)) return false;
      if (filter === "scheduled" && m.status !== "scheduled") return false;
      if (filter === "settled" && m.status !== "settled") return false;
      if (competitionId !== "all" && m.competitionId !== competitionId) return false;
      if (!q) return true;
      return (
        teamName(m.homeTeamId, teamsById).toLowerCase().includes(q) ||
        teamName(m.awayTeamId, teamsById).toLowerCase().includes(q)
      );
    });
    return GROUP_ORDER
      .map((group) => ({ group, items: rows.filter((m) => fixtureGroup(m, now) === group) }))
      .filter((s) => s.items.length > 0);
  }, [matches, now, filter, competitionId, search, teamsById]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  function closeModal() {
    setConfirm(null);
    setScores({ home: "", away: "" });
  }

  async function handleConfirm() {
    if (!confirm) return;
    setBusy(true);
    const body: Record<string, unknown> = { matchId: confirm.match.id };
    if (confirm.type === "settle") {
      body.homeScore = Number(scores.home);
      body.awayScore = Number(scores.away);
    }
    const result = await onAction(ENDPOINTS[confirm.type], body, SUCCESS[confirm.type]);
    setBusy(false);
    if (result.ok) closeModal();
  }

  async function startLive(m: Match) {
    setBusy(true);
    await onAction(
      "/api/admin/matches/live-score",
      {
        matchId: m.id,
        homeScore: m.currentHomeScore ?? 0,
        awayScore: m.currentAwayScore ?? 0,
        status: "live",
      },
      "Match is live"
    );
    setBusy(false);
    setLiveOpenIds((prev) => new Set(prev).add(m.id));
  }

  const h = confirm ? teamName(confirm.match.homeTeamId, teamsById) : "";
  const a = confirm ? teamName(confirm.match.awayTeamId, teamsById) : "";

  const confirmCopy: Record<Exclude<ConfirmType, "settle">, { title: string; message: string; label: string }> = {
    open: { title: "Open betting", message: `Open betting for ${h} vs ${a}? Users can bet as soon as odds are set.`, label: "Open" },
    close: { title: "Close betting", message: `Close betting for ${h} vs ${a} and return it to Scheduled?`, label: "Close" },
    void: { title: "Void match", message: `Void ${h} vs ${a}? Every open bet on it is refunded its stake.`, label: "Void" },
    delete: { title: "Delete fixture", message: `Delete ${h} vs ${a}? This only works if nobody has bet on it.`, label: "Delete" },
    reopen: { title: "Reopen match", message: `Reopen ${h} vs ${a}? Scores are cleared. Bets that were already settled are NOT reversed.`, label: "Reopen" },
  };
  const copy = confirm && confirm.type !== "settle" ? confirmCopy[confirm.type] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Fixtures</h2>
          <p className="mt-1 text-sm text-adm-muted">
            {total} {total === 1 ? "match" : "matches"} · upcoming first
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
          {competitionOptions.length > 1 && (
            <Select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} className="w-auto max-w-[11rem]">
              <option value="all">All competitions</option>
              {competitionOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Select value={filter} onChange={(e) => setFilter(e.target.value as FixtureFilter)} className="w-auto">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="open">Open</option>
            <option value="live">Live</option>
            <option value="settled">Settled</option>
            <option value="final">Final</option>
          </Select>
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState
            title={matches.length === 0 ? "No fixtures yet" : "No fixtures match these filters"}
            hint={matches.length === 0 ? "Use the Import tab to add your first fixtures." : "Try clearing the search or filters."}
          />
        </Card>
      ) : (
        sections.map(({ group, items }) => (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-adm-faint">
              {GROUP_LABEL[group]} · {items.length}
            </h3>
            <Card flush className="divide-y divide-adm-line overflow-hidden">
              {items.map((m) => {
                const final = isFinal(m);
                const inPlay = isInPlay(m);
                const marketFormOpen = marketOpenIds.has(m.id);
                const liveFormOpen = liveOpenIds.has(m.id);
                const score = displayScore(m);
                const home = teamName(m.homeTeamId, teamsById);
                const away = teamName(m.awayTeamId, teamsById);

                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{home}</p>
                        <p className="font-medium leading-snug">{away}</p>
                        <p className="mt-1 text-xs text-adm-muted">
                          {formatKickoff(m.kickoffAt)} · {competitionName(m.competitionId, competitionsById)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge status={m.status} />
                        {score && (
                          <span className={`text-sm font-semibold tabular-nums ${score.live ? "text-adm-bad" : ""}`}>
                            {score.home} – {score.away}
                            {score.live && <span className="ml-1 text-[10px] font-medium uppercase">live</span>}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.status === "scheduled" && (
                        <Button size="sm" onClick={() => setConfirm({ type: "open", match: m })}>
                          Open betting
                        </Button>
                      )}
                      {m.status === "open" && (
                        <>
                          <Button size="sm" onClick={() => startLive(m)} disabled={busy}>
                            Start live
                          </Button>
                          <Button size="sm" onClick={() => setConfirm({ type: "settle", match: m })}>
                            Settle
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setConfirm({ type: "close", match: m })}>
                            Close betting
                          </Button>
                        </>
                      )}
                      {inPlay && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => toggleLiveForm(m.id)}>
                            {liveFormOpen ? "Hide live score" : "Update live score"}
                          </Button>
                          <Button size="sm" onClick={() => setConfirm({ type: "settle", match: m })}>
                            Settle
                          </Button>
                        </>
                      )}
                      {!final && (
                        <Button size="sm" variant="secondary" onClick={() => toggleMarketForm(m.id)}>
                          {marketFormOpen ? "Hide markets" : "Add market"}
                        </Button>
                      )}
                      {final && (
                        <Button size="sm" variant="secondary" onClick={() => setConfirm({ type: "reopen", match: m })}>
                          Reopen
                        </Button>
                      )}
                      {!final && (
                        <Button size="sm" variant="danger" onClick={() => setConfirm({ type: "void", match: m })}>
                          Void
                        </Button>
                      )}
                      {m.status === "scheduled" && (
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ type: "delete", match: m })}>
                          Delete
                        </Button>
                      )}
                    </div>

                    {liveFormOpen && inPlay && (
                      <LiveScoreEditor match={m} homeLabel={home} awayLabel={away} onAction={onAction} />
                    )}

                    {marketFormOpen && <MarketCreator matchId={m.id} onCreated={() => toggleMarketForm(m.id)} />}
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}

       <Modal open={confirm?.type === "settle"} onClose={closeModal} title="Settle match">
        <p className="mb-4 text-sm text-adm-muted">Enter the final score. Every open bet on this match is settled.</p>
        <div className="mb-5 flex flex-col gap-3">
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium">{h}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={scores.home}
              onChange={(e) => setScores((s) => ({ ...s, home: e.target.value }))}
              className="w-20 text-center"
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium">{a}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={scores.away}
              onChange={(e) => setScores((s) => ({ ...s, away: e.target.value }))}
              className="w-20 text-center"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeModal}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !isValidScore(scores.home) || !isValidScore(scores.away)}>
            {busy ? "Settling…" : "Settle"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        open={copy !== null}
        onClose={closeModal}
        onConfirm={handleConfirm}
        title={copy?.title ?? ""}
        message={copy?.message ?? ""}
        confirmLabel={copy?.label}
        danger={confirm?.type === "void" || confirm?.type === "delete"}
        loading={busy}
      />
    </div>
  );
}
