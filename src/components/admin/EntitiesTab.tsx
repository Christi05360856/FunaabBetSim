"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, CardHeader, Button, Input, Select, Field, EmptyState } from "./ui";

type PostResult = { ok: boolean; message: string };

// Short code is optional in the form — we build one from the initials.
// (Users always see the FULL team name; the code is only a compact fallback.)
function autoShortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("").toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 4);
  return name.replace(/\s+/g, "").slice(0, 3).toUpperCase();
}

export default function EntitiesTab({ teams, competitions, matches, onAddTeam, onAddCompetition }: {
  teams: Team[];
  competitions: Competition[];
  matches: Match[];
  onAddTeam: (b: unknown) => Promise<PostResult>;
  onAddCompetition: (b: unknown) => Promise<PostResult>;
}) {
  const [team, setTeam] = useState({ name: "", short: "" });
  const [comp, setComp] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all"); // "all" | "none" | competitionId
  const [busy, setBusy] = useState(false);

  // Which competitions each team plays in, worked out from the fixtures.
  const membership = useMemo(() => {
    const teamComps = new Map<string, Set<string>>();
    const compTeams = new Map<string, Set<string>>();
    const compFixtures = new Map<string, number>();
    for (const m of matches) {
      compFixtures.set(m.competitionId, (compFixtures.get(m.competitionId) ?? 0) + 1);
      for (const teamId of [m.homeTeamId, m.awayTeamId]) {
        if (!teamComps.has(teamId)) teamComps.set(teamId, new Set());
        teamComps.get(teamId)!.add(m.competitionId);
        if (!compTeams.has(m.competitionId)) compTeams.set(m.competitionId, new Set());
        compTeams.get(m.competitionId)!.add(teamId);
      }
    }
    return { teamComps, compTeams, compFixtures };
  }, [matches]);

  const compNameById = useMemo(() => new Map<string, string>(competitions.map((c) => [c.id, c.name] as [string, string])), [competitions]);

  const visibleTeams = teams.filter((t) => {
    if (teamFilter === "all") return true;
    const inComps = membership.teamComps.get(t.id);
    if (teamFilter === "none") return !inComps;
    return inComps?.has(teamFilter) === true;
  });

  const teamNameTaken = teams.some((t) => t.name.trim().toLowerCase() === team.name.trim().toLowerCase());
  const compNameTaken = competitions.some((c) => c.name.trim().toLowerCase() === comp.trim().toLowerCase());
  const teamOk = team.name.trim().length >= 2 && !teamNameTaken;
  const compOk = comp.trim().length >= 2 && !compNameTaken;

  async function submitTeam(e: FormEvent) {
    e.preventDefault();
    if (!teamOk) return;
    setBusy(true);
    const name = team.name.trim();
    const shortName = (team.short.trim() || autoShortName(name)).toUpperCase();
    const r = await onAddTeam({ name, shortName });
    if (r.ok) setTeam({ name: "", short: "" });
    setBusy(false);
  }

  async function submitComp(e: FormEvent) {
    e.preventDefault();
    if (!compOk) return;
    setBusy(true);
    const r = await onAddCompetition({ name: comp.trim() });
    if (r.ok) setComp("");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Teams &amp; Competitions</h2>
        <p className="mt-1 text-sm text-adm-muted">A team joins a competition when you add fixtures for it.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add competition" subtitle="e.g. FUNAABSU League, Dean's Cup" />
          <form onSubmit={submitComp} className="flex flex-col gap-3">
            <Input placeholder="Competition name" value={comp} onChange={(e) => setComp(e.target.value)} />
            {compNameTaken && comp.trim() && <p className="text-xs text-adm-warn">A competition with this name already exists.</p>}
            <Button type="submit" disabled={busy || !compOk}>Add competition</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Add team" />
          <form onSubmit={submitTeam} className="flex flex-col gap-3">
            <Field label="Full team name">
              <Input placeholder="e.g. Computer Science FC" value={team.name} onChange={(e) => setTeam((t) => ({ ...t, name: e.target.value }))} />
            </Field>
            <Field label="Short code (optional)">
              <Input placeholder="Auto if empty" value={team.short} onChange={(e) => setTeam((t) => ({ ...t, short: e.target.value }))} maxLength={5} />
            </Field>
            {teamNameTaken && team.name.trim() && <p className="text-xs text-adm-warn">A team with this name already exists.</p>}
            <Button type="submit" disabled={busy || !teamOk}>Add team</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Competitions" subtitle={`${competitions.length} total`} />
          {competitions.length === 0 ? (
            <EmptyState title="No competitions yet" />
          ) : (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {competitions.map((c) => (
                <div key={c.id} className="rounded-lg bg-adm-raised px-3 py-2">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-adm-muted">
                    {membership.compFixtures.get(c.id) ?? 0} fixtures · {membership.compTeams.get(c.id)?.size ?? 0} teams
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Teams"
            subtitle={`${visibleTeams.length} shown of ${teams.length}`}
            action={
              competitions.length > 0 ? (
                <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="w-auto max-w-[10rem]">
                  <option value="all">All teams</option>
                  {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="none">No fixtures yet</option>
                </Select>
              ) : undefined
            }
          />
          {visibleTeams.length === 0 ? (
            <EmptyState title="No teams here" />
          ) : (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {visibleTeams.map((t) => {
                const inComps = Array.from(membership.teamComps.get(t.id) ?? []).map((id) => compNameById.get(id) ?? "Unknown");
                return (
                  <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg bg-adm-raised px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      {teamFilter === "all" && inComps.length > 0 && <p className="text-xs text-adm-muted">{inComps.join(" · ")}</p>}
                    </div>
                    <span className="shrink-0 rounded bg-adm-line px-1.5 py-0.5 font-mono text-[11px] text-adm-muted">{t.shortName}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

