"use client";

import { useMemo } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, CardHeader, Badge, Button, EmptyState } from "./ui";
import { competitionName, fixtureGroup, formatKickoff, hasScore, isFinal, sortFixtures, teamName, useNow } from "./helpers";

type Props = {
  matches: Match[];
  teams: Team[];
  competitions: Competition[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onViewFixtures: () => void;
};

export default function OverviewTab({ matches, teams, competitions, teamsById, competitionsById, onViewFixtures }: Props) {
  const now = useNow();

  const stats = useMemo(() => ({
    total: matches.length,
    scheduled: matches.filter((m) => m.status === "scheduled").length,
    open: matches.filter((m) => m.status === "open").length,
    settled: matches.filter((m) => m.status === "settled").length,
    live: matches.filter((m) => ["live", "halftime", "second_half"].includes(m.status)).length,
  }), [matches]);

  // "Coming up" = live now + upcoming, soonest first. "Results" = finished, newest first.
  const { comingUp, results } = useMemo(() => {
    const sorted = sortFixtures(matches, now);
    return {
      comingUp: sorted.filter((m) => { const g = fixtureGroup(m, now); return g === "live" || g === "upcoming"; }).slice(0, 5),
      results: sorted.filter((m) => isFinal(m)).slice(0, 5),
    };
  }, [matches, now]);

  const cards = [
    { label: "Total Matches", value: stats.total, color: "text-adm-ink", sub: "" },
    { label: "Scheduled", value: stats.scheduled, color: "text-adm-info", sub: "" },
    { label: "Open", value: stats.open, color: "text-adm-ok", sub: "" },
    { label: "Live", value: stats.live, color: "text-adm-bad", sub: "" },
    { label: "Settled", value: stats.settled, color: "text-adm-muted", sub: "" },
    { label: "Teams", value: teams.length, color: "text-adm-ink", sub: `${competitions.length} competition${competitions.length === 1 ? "" : "s"}` },
  ];

  const renderRow = (m: Match) => (
      <div key={m.id} className="flex items-start justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{teamName(m.homeTeamId, teamsById)}</p>
          <p className="text-sm font-medium leading-snug">{teamName(m.awayTeamId, teamsById)}</p>
          <p className="mt-1 text-xs text-adm-muted">{formatKickoff(m.kickoffAt)} · {competitionName(m.competitionId, competitionsById)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge status={m.status} />
          {hasScore(m) && <span className="text-sm font-semibold tabular-nums">{m.homeScore} – {m.awayScore}</span>}
        </div>
      </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="mt-1 text-sm text-adm-muted">Platform overview</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((s) => (
          <Card key={s.label} compact>
            <p className="text-xs text-adm-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
            {s.sub && <p className="mt-0.5 text-xs text-adm-faint">{s.sub}</p>}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Coming up"
          subtitle="Live and upcoming fixtures, soonest first"
          action={<Button size="sm" variant="ghost" onClick={onViewFixtures}>View all</Button>}
        />
        {comingUp.length === 0 ? (
          <EmptyState title="Nothing scheduled" hint="Import fixtures from the Import tab." />
        ) : (
          <div className="flex flex-col divide-y divide-adm-line">{comingUp.map(renderRow)}</div>
        )}
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader title="Recent results" subtitle="Latest finished fixtures" />
          <div className="flex flex-col divide-y divide-adm-line">{results.map(renderRow)}</div>
        </Card>
      )}
    </div>
  );
}

