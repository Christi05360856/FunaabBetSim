"use client";

import { useState, type FormEvent } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, CardHeader, Button, Input, Badge } from "./ui";

type PostResult = { ok: boolean; message: string };

export default function OddsTab({ matches, teamsById, competitionsById, onSubmit }: { 
  matches: Match[]; 
  teamsById: Record<string, Team>; 
  competitionsById: Record<string, Competition>; 
  onSubmit: (body: unknown) => Promise<PostResult> 
}) {
  const [selected, setSelected] = useState<Match | null>(null);
  const [odds, setOdds] = useState({ home: "", draw: "", away: "" });
  const [busy, setBusy] = useState(false);
  const openMatches = matches.filter((m) => ["open", "scheduled"].includes(m.status));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    await onSubmit({ matchId: selected.id, homeOdds: Number(odds.home), drawOdds: Number(odds.draw), awayOdds: Number(odds.away) });
    setBusy(false); setOdds({ home: "", draw: "", away: "" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div><h2 className="text-xl font-bold">Odds</h2><p className="mt-1 text-sm text-zinc-500">Set match winner odds</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Select Match" />
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {openMatches.map((m) => (
              <button key={m.id} onClick={() => setSelected(m)} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${selected?.id === m.id ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-700"}`}>
                <div><p className="font-medium">{teamsById[m.homeTeamId]?.name} vs {teamsById[m.awayTeamId]?.name}</p><p className="text-xs text-zinc-500">{competitionsById[m.competitionId]?.name}</p></div>
                <Badge status={m.status} />
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Set 1X2 Odds" subtitle={selected ? `${teamsById[selected.homeTeamId]?.name} vs ${teamsById[selected.awayTeamId]?.name}` : "Select a match"} />
          {selected ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="mb-1 block text-xs text-zinc-500">Home</label><Input type="number" step="0.01" value={odds.home} onChange={(e) => setOdds(o => ({ ...o, home: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-zinc-500">Draw</label><Input type="number" step="0.01" value={odds.draw} onChange={(e) => setOdds(o => ({ ...o, draw: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-zinc-500">Away</label><Input type="number" step="0.01" value={odds.away} onChange={(e) => setOdds(o => ({ ...o, away: e.target.value }))} /></div>
              </div>
              <Button type="submit" disabled={busy || !odds.home || !odds.draw || !odds.away}>{busy ? "Saving…" : "Set Odds"}</Button>
            </form>
          ) : <div className="flex h-40 items-center justify-center text-sm text-zinc-500">Select a match</div>}
        </Card>
      </div>
    </div>
  );
}

