"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, CardHeader, Button, Input, Field, Badge, EmptyState } from "./ui";
import { competitionName, formatKickoff, sortFixtures, teamName, useNow } from "./helpers";

type PostResult = { ok: boolean; message: string };

// Matches the server rule (1.01 – 1000).
const isValidOdds = (s: string) => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 1.01 && n <= 1000;
};

export default function OddsTab({ matches, teamsById, competitionsById, onSubmit }: {
  matches: Match[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onSubmit: (body: unknown) => Promise<PostResult>;
}) {
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [odds, setOdds] = useState({ home: "", draw: "", away: "" });
  const [busy, setBusy] = useState(false);

  // Only matches that can still take bets, soonest first.
  const candidates = useMemo(
    () => sortFixtures(matches.filter((m) => ["open", "scheduled"].includes(m.status)), now),
    [matches, now]
  );
  const selected = candidates.find((m) => m.id === selectedId) ?? null;
  const allValid = isValidOdds(odds.home) && isValidOdds(odds.draw) && isValidOdds(odds.away);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !allValid) return;
    setBusy(true);
    const r = await onSubmit({ matchId: selected.id, homeOdds: Number(odds.home), drawOdds: Number(odds.draw), awayOdds: Number(odds.away) });
    setBusy(false);
    if (r.ok) setOdds({ home: "", draw: "", away: "" }); // keep your numbers if it failed
  }

  const title = selected ? `${teamName(selected.homeTeamId, teamsById)} vs ${teamName(selected.awayTeamId, teamsById)}` : "Select a match";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Odds</h2>
        <p className="mt-1 text-sm text-adm-muted">Set match winner (1X2) odds. Odds are fixed once saved.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
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

        <Card>
          <CardHeader title="Set 1X2 odds" subtitle={title} />
          {selected ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Home"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={odds.home} onChange={(e) => setOdds((o) => ({ ...o, home: e.target.value }))} /></Field>
                <Field label="Draw"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={odds.draw} onChange={(e) => setOdds((o) => ({ ...o, draw: e.target.value }))} /></Field>
                <Field label="Away"><Input type="number" inputMode="decimal" step="0.01" min="1.01" value={odds.away} onChange={(e) => setOdds((o) => ({ ...o, away: e.target.value }))} /></Field>
              </div>
              <p className="text-xs text-adm-faint">Each value must be between 1.01 and 1000.</p>
              <Button type="submit" disabled={busy || !allValid}>{busy ? "Saving…" : "Save odds"}</Button>
            </form>
          ) : (
            <EmptyState title="Pick a match on the left" />
          )}
        </Card>
      </div>
    </div>
  );
}

