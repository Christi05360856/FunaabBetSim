"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Team, Competition, Match, MarketType } from "@/types/domain";
import { Card, CardHeader, Button, Input, Field, Badge, EmptyState } from "./ui";
import { competitionName, formatKickoff, sortFixtures, teamName, useNow } from "./helpers";

type PostResult = { ok: boolean; message: string };

const isValidOdds = (s: string) => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 1.01 && n <= 1000;
};

const OU_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];

const CORRECT_SCORES = [
  "1:0", "2:0", "2:1", "3:0", "3:1", "3:2",
  "4:0", "4:1", "4:2", "4:3",
  "0:0", "1:1", "2:2", "3:3", "4:4",
  "0:1", "0:2", "1:2", "0:3", "1:3", "2:3",
  "0:4", "1:4", "2:4", "3:4",
];

export default function OddsTab({ matches, teamsById, competitionsById, onSubmit }: {
  matches: Match[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onSubmit: (body: unknown) => Promise<PostResult>;
}) {
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 1X2
  const [odds1x2, setOdds1x2] = useState({ home: "", draw: "", away: "" });

  // Double Chance
  const [oddsDC, setOddsDC] = useState({ homeDraw: "", homeAway: "", drawAway: "" });

  // Draw No Bet
  const [oddsDNB, setOddsDNB] = useState({ home: "", away: "" });

  // Over/Under — one odds pair per line
  const [ouLine, setOuLine] = useState<number>(2.5);
  const [oddsOU, setOddsOU] = useState({ over: "", under: "" });

  // BTTS
  const [oddsBTTS, setOddsBTTS] = useState({ yes: "", no: "" });

  // Correct Score — map of score -> odds
  const [oddsCS, setOddsCS] = useState<Record<string, string>>({});

  const candidates = useMemo(
    () => sortFixtures(matches.filter((m) => ["open", "scheduled"].includes(m.status)), now),
    [matches, now]
  );
  const selected = candidates.find((m) => m.id === selectedId) ?? null;

  const valid1x2 = isValidOdds(odds1x2.home) && isValidOdds(odds1x2.draw) && isValidOdds(odds1x2.away);
  const validDC = isValidOdds(oddsDC.homeDraw) && isValidOdds(oddsDC.homeAway) && isValidOdds(oddsDC.drawAway);
  const validDNB = isValidOdds(oddsDNB.home) && isValidOdds(oddsDNB.away);
  const validOU = isValidOdds(oddsOU.over) && isValidOdds(oddsOU.under);
  const validBTTS = isValidOdds(oddsBTTS.yes) && isValidOdds(oddsBTTS.no);
  const validCS = Object.values(oddsCS).some((v) => v.trim() !== "" && isValidOdds(v));

  async function submitMarket(type: MarketType, selections: { id: string; label: string; odds: number }[], extra?: object) {
    if (!selected) return;
    setBusy(true);
    const r = await onSubmit({ matchId: selected.id, type, selections, ...extra });
    setBusy(false);
    return r;
  }

  async function handle1x2(e: FormEvent) {
    e.preventDefault();
    if (!selected || !valid1x2) return;
    const r = await submitMarket("match_winner", [
      { id: "home", label: "Home", odds: Number(odds1x2.home) },
      { id: "draw", label: "Draw", odds: Number(odds1x2.draw) },
      { id: "away", label: "Away", odds: Number(odds1x2.away) },
    ]);
    if (r?.ok) setOdds1x2({ home: "", draw: "", away: "" });
  }

  async function handleDC(e: FormEvent) {
    e.preventDefault();
    if (!selected || !validDC) return;
    const r = await submitMarket("double_chance", [
      { id: "home_draw", label: "1X", odds: Number(oddsDC.homeDraw) },
      { id: "home_away", label: "12", odds: Number(oddsDC.homeAway) },
      { id: "draw_away", label: "X2", odds: Number(oddsDC.drawAway) },
    ]);
    if (r?.ok) setOddsDC({ homeDraw: "", homeAway: "", drawAway: "" });
  }

  async function handleDNB(e: FormEvent) {
    e.preventDefault();
    if (!selected || !validDNB) return;
    const r = await submitMarket("draw_no_bet", [
      { id: "home", label: "Home", odds: Number(oddsDNB.home) },
      { id: "away", label: "Away", odds: Number(oddsDNB.away) },
    ]);
    if (r?.ok) setOddsDNB({ home: "", away: "" });
  }

  async function handleOU(e: FormEvent) {
    e.preventDefault();
    if (!selected || !validOU) return;
    const r = await submitMarket("over_under", [
      { id: "over", label: "Over", odds: Number(oddsOU.over) },
      { id: "under", label: "Under", odds: Number(oddsOU.under) },
    ], { line: ouLine });
    if (r?.ok) setOddsOU({ over: "", under: "" });
  }

  async function handleBTTS(e: FormEvent) {
    e.preventDefault();
    if (!selected || !validBTTS) return;
    const r = await submitMarket("both_teams_to_score", [
      { id: "yes", label: "Yes", odds: Number(oddsBTTS.yes) },
      { id: "no", label: "No", odds: Number(oddsBTTS.no) },
    ]);
    if (r?.ok) setOddsBTTS({ yes: "", no: "" });
  }

  async function handleCS(e: FormEvent) {
    e.preventDefault();
    if (!selected || !validCS) return;
    const selections = Object.entries(oddsCS)
      .filter(([, v]) => v.trim() !== "" && isValidOdds(v))
      .map(([score, v]) => ({ id: score.replace(":", "-"), label: score, odds: Number(v) }));
    const r = await submitMarket("correct_score", selections);
    if (r?.ok) setOddsCS({});
  }

  const title = selected
    ? `${teamName(selected.homeTeamId, teamsById)} vs ${teamName(selected.awayTeamId, teamsById)}`
    : "Select a match";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Odds</h2>
        <p className="mt-1 text-sm text-adm-muted">Set odds for all market types. Odds are fixed once saved.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Match selector */}
        <Card>
          <CardHeader title="Select match" subtitle="Soonest first" />
          {candidates.length === 0 ? (
            <EmptyState title="No matches waiting for odds" />
          ) : (
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {candidates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedId === m.id ? "border-adm-brand bg-adm-brand/5" : "border-adm-line-strong hover:bg-adm-raised"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{teamName(m.homeTeamId, teamsById)}</p>
                    <p className="font-medium leading-snug">{teamName(m.awayTeamId, teamsById)}</p>
                    <p className="mt-1 text-xs text-adm-muted">{formatKickoff(m.kickoffAt)} · {competitionName(m.competitionId, competitionsById)}</p>
                  </div>
                  <Badge status={m.status} />
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Odds forms */}
        {selected ? (
          <div className="flex flex-col gap-4">
            {/* 1X2 */}
            <Card>
              <CardHeader title="1X2 — Match Winner" subtitle={title} />
              <form onSubmit={handle1x2} className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Home"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={odds1x2.home} onChange={(e) => setOdds1x2((o) => ({ ...o, home: e.target.value }))} /></Field>
                  <Field label="Draw"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={odds1x2.draw} onChange={(e) => setOdds1x2((o) => ({ ...o, draw: e.target.value }))} /></Field>
                  <Field label="Away"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={odds1x2.away} onChange={(e) => setOdds1x2((o) => ({ ...o, away: e.target.value }))} /></Field>
                </div>
                <Button type="submit" disabled={busy || !valid1x2}>{busy ? "Saving…" : "Save 1X2"}</Button>
              </form>
            </Card>

            {/* Double Chance */}
            <Card>
              <CardHeader title="Double Chance" />
              <form onSubmit={handleDC} className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="1X"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsDC.homeDraw} onChange={(e) => setOddsDC((o) => ({ ...o, homeDraw: e.target.value }))} /></Field>
                  <Field label="12"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsDC.homeAway} onChange={(e) => setOddsDC((o) => ({ ...o, homeAway: e.target.value }))} /></Field>
                  <Field label="X2"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsDC.drawAway} onChange={(e) => setOddsDC((o) => ({ ...o, drawAway: e.target.value }))} /></Field>
                </div>
                <Button type="submit" disabled={busy || !validDC}>{busy ? "Saving…" : "Save DC"}</Button>
              </form>
            </Card>

            {/* Draw No Bet */}
            <Card>
              <CardHeader title="Draw No Bet" />
              <form onSubmit={handleDNB} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Home"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsDNB.home} onChange={(e) => setOddsDNB((o) => ({ ...o, home: e.target.value }))} /></Field>
                  <Field label="Away"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsDNB.away} onChange={(e) => setOddsDNB((o) => ({ ...o, away: e.target.value }))} /></Field>
                </div>
                <Button type="submit" disabled={busy || !validDNB}>{busy ? "Saving…" : "Save DNB"}</Button>
              </form>
            </Card>

            {/* Over/Under with line dropdown */}
            <Card>
              <CardHeader title="Over/Under" />
              <form onSubmit={handleOU} className="flex flex-col gap-3">
                <Field label="Goal Line">
                  <select
                    value={ouLine}
                    onChange={(e) => setOuLine(Number(e.target.value))}
                    className="w-full rounded-lg border border-adm-line-strong bg-adm-surface px-3 py-2 text-sm"
                  >
                    {OU_LINES.map((l) => (
                      <option key={l} value={l}>{l} goals</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Over"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsOU.over} onChange={(e) => setOddsOU((o) => ({ ...o, over: e.target.value }))} /></Field>
                  <Field label="Under"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsOU.under} onChange={(e) => setOddsOU((o) => ({ ...o, under: e.target.value }))} /></Field>
                </div>
                <Button type="submit" disabled={busy || !validOU}>{busy ? "Saving…" : "Save O/U"}</Button>
              </form>
            </Card>

            {/* BTTS */}
            <Card>
              <CardHeader title="Both Teams to Score" />
              <form onSubmit={handleBTTS} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Yes"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsBTTS.yes} onChange={(e) => setOddsBTTS((o) => ({ ...o, yes: e.target.value }))} /></Field>
                  <Field label="No"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={oddsBTTS.no} onChange={(e) => setOddsBTTS((o) => ({ ...o, no: e.target.value }))} /></Field>
                </div>
                <Button type="submit" disabled={busy || !validBTTS}>{busy ? "Saving…" : "Save BTTS"}</Button>
              </form>
            </Card>

            {/* Correct Score */}
            <Card>
              <CardHeader title="Correct Score" subtitle="Fill in odds for scores you want to offer" />
              <form onSubmit={handleCS} className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-2">
                  {CORRECT_SCORES.map((score) => (
                    <Field key={score} label={score}>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="1.01"
                        value={oddsCS[score] ?? ""}
                        onChange={(e) => setOddsCS((prev) => ({ ...prev, [score]: e.target.value }))}
                      />
                    </Field>
                  ))}
                </div>
                <Button type="submit" disabled={busy || !validCS}>{busy ? "Saving…" : "Save Correct Score"}</Button>
              </form>
            </Card>
          </div>
        ) : (
          <Card>
            <EmptyState title="Pick a match on the left" />
          </Card>
        )}
      </div>
    </div>
  );
}
