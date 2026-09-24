"use client";

import { useMemo } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, CardHeader, Badge } from "./ui";

export default function OverviewTab({ matches, teams, competitions }: { matches: Match[]; teams: Team[]; competitions: Competition[] }) {
  const stats = useMemo(() => ({
    total: matches.length,
    scheduled: matches.filter((m) => m.status === "scheduled").length,
    open: matches.filter((m) => m.status === "open").length,
    settled: matches.filter((m) => m.status === "settled").length,
    live: matches.filter((m) => ["live", "halftime", "second_half"].includes(m.status)).length,
  }), [matches]);

  const cards = [
    { label: "Total Matches", value: stats.total, color: "text-zinc-100" },
    { label: "Scheduled", value: stats.scheduled, color: "text-blue-400" },
    { label: "Open", value: stats.open, color: "text-emerald-400" },
    { label: "Live", value: stats.live, color: "text-red-400" },
    { label: "Settled", value: stats.settled, color: "text-zinc-400" },
    { label: "Teams", value: teams.length, color: "text-zinc-100" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div><h2 className="text-xl font-bold">Dashboard</h2><p className="mt-1 text-sm text-zinc-500">Platform overview</p></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((s) => <Card key={s.label} className="p-4"><p className="text-xs text-zinc-500">{s.label}</p><p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p></Card>)}
      </div>
      <Card>
        <CardHeader title="Recent Matches" />
        <div className="flex flex-col divide-y divide-zinc-800">
          {matches.slice(0, 5).map((m) => (
            <div key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{m.homeTeamId} vs {m.awayTeamId}</p>
                <p className="text-xs text-zinc-500">{new Date(m.kickoffAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <Badge status={m.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

