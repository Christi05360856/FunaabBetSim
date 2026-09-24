"use client";

import { useState, type FormEvent } from "react";
import type { Team, Competition } from "@/types/domain";
import { Card, CardHeader, Button, Input } from "./ui";

type PostResult = { ok: boolean; message: string };

export default function EntitiesTab({ teams, competitions, onAddTeam, onAddCompetition }: { 
  teams: Team[]; 
  competitions: Competition[]; 
  onAddTeam: (b: unknown) => Promise<PostResult>; 
  onAddCompetition: (b: unknown) => Promise<PostResult> 
}) {
  const [team, setTeam] = useState({ name: "", short: "" });
  const [comp, setComp] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitTeam(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await onAddTeam({ name: team.name, shortName: team.short });
    if (r.ok) setTeam({ name: "", short: "" }); setBusy(false);
  }

  async function submitComp(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await onAddCompetition({ name: comp });
    if (r.ok) setComp(""); setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div><h2 className="text-xl font-bold">Teams & Competitions</h2></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add Team" />
          <form onSubmit={submitTeam} className="flex flex-col gap-3">
            <Input placeholder="Team name" value={team.name} onChange={(e) => setTeam(t => ({ ...t, name: e.target.value }))} />
            <Input placeholder="Short name (COE)" value={team.short} onChange={(e) => setTeam(t => ({ ...t, short: e.target.value }))} maxLength={4} />
            <Button type="submit" disabled={busy || !team.name || !team.short}>Add Team</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Add Competition" />
          <form onSubmit={submitComp} className="flex flex-col gap-3">
            <Input placeholder="Competition name" value={comp} onChange={(e) => setComp(e.target.value)} />
            <Button type="submit" disabled={busy || !comp}>Add Competition</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Teams" subtitle={`${teams.length} total`} />
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {teams.map((t) => <div key={t.id} className="flex justify-between rounded bg-zinc-800/30 px-3 py-2 text-sm"><span>{t.name}</span><span className="text-xs font-mono text-zinc-500">{t.shortName}</span></div>)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Competitions" subtitle={`${competitions.length} total`} />
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {competitions.map((c) => <div key={c.id} className="rounded bg-zinc-800/30 px-3 py-2 text-sm">{c.name}</div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

