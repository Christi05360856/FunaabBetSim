"use client";

import { useMemo } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, CardHeader, Badge, Button, EmptyState } from "./ui";
import {
  competitionName,
  displayScore,
  fixtureGroup,
  formatKickoff,
  isFinal,
  sortFixtures,
  teamName,
  useNow,
} from "./helpers";
import type { FixtureFilter } from "./FixturesTab";

type Props = {
  matches: Match[];
  teams: Team[];
  competitions: Competition[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onNavigateToFixtures: (filter?: FixtureFilter) => void;
};

export default function OverviewTab({
  matches,
  teams,
  competitions,
  teamsById,
  competitionsById,
  onNavigateToFixtures,
}: Props) {
  const now = useNow();

  const stats = useMemo(
    () => ({
      total: matches.length,
      scheduled: matches.filter((m) => m.status === "scheduled").length,
      open: matches.filter((m) => m.status === "open").length,
      settled: matches.filter((m) => m.status === "settled").length,
      live: matches.filter((m) => ["live", "halftime", "second_half"].includes(m.status)).length,
    }),
    [matches]
  );

  const { comingUp, results } = useMemo(() => {
    const sorted = sortFixtures(matches, now);
    return {
      comingUp: sorted
        .filter((m) => {
          const g = fixtureGroup(m, now);
          return g === "live" || g === "upcoming";
        })
        .slice(0, 5),
      results: sorted.filter((m) => isFinal(m)).slice(0, 5),
    };
  }, [matches, now]);

  const cards: {
    label: string;
    value: number;
    color: string;
    sub: string;
    filter?: FixtureFilter;
  }[] = [
    { label: "Total Matches", value: stats.total, color: "text-adm-ink", sub: "", filter: "all" },
    { label: "Scheduled", value: stats.scheduled, color: "text-adm-info", sub: "", filter: "scheduled" },
    { label: "Open", value: stats.open, color: "text-adm-ok", sub: "", filter: "open" },
    { label: "Live", value: stats.live, color: "text-adm-bad", sub: "", filter: "live" },
    { label: "Settled", value: stats.settled, color: "text-adm-muted", sub: "", filter: "settled" },
    { label: "Teams", value: teams.length, color: "text-adm-ink", sub: `\( {competitions.length} competition \){competitions.length === 1 ? "" : "s"}` },
  ];

  const renderRow = (m: Match) => {
    const score = displayScore(m);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => onNavigateToFixtures(isFinal(m) ? "final" : m.status === "open" ? "open" : isFinal(m) ? "final" : "all")}
        className="flex w-full items-start justify-between gap-3 py-3 text-left transition-colors hover:bg-adm-raised/50"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{teamName(m.homeTeamId, teamsById)}</p>
          <p className="text-sm font-medium leading-snug">{teamName(m.awayTeamId, teamsById)}</p>
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
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="mt-1 text-sm text-adm-muted">Platform overview</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={!s.filter}
            onClick={() => s.filter && onNavigateToFixtures(s.filter)}
            className={`text-left transition-opacity ${s.filter ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
          >
            <Card compact>
              <p className="text-xs text-adm-muted">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
              {s.sub && <p className="mt-0.5 text-xs text-adm-faint">{s.sub}</p>}
            </Card>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Coming up"
          subtitle="Live and upcoming fixtures, soonest first"
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigateToFixtures("all")}>
              View all
            </Button>
          }
        />
        {comingUp.length === 0 ? (
          <EmptyState title="Nothing scheduled" hint="Import fixtures from the Import tab." />
        ) : (
          <div className="flex flex-col divide-y divide-adm-line">{comingUp.map(renderRow)}</div>
        )}
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader
            title="Recent results"
            subtitle="Latest finished fixtures"
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigateToFixtures("final")}>
                View all
              </Button>
            }
          />
          <div className="flex flex-col divide-y divide-adm-line">{results.map(renderRow)}</div>
        </Card>
      )}
    </div>
  );
}
