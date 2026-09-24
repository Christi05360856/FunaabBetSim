"use client";

import { useMemo, useState } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, Badge, Button, Input, Select, Modal, ConfirmModal, EmptyState } from "./ui";
import { GROUP_LABEL, GROUP_ORDER, competitionName, fixtureGroup, formatKickoff, hasScore, isFinal, sortFixtures, teamName, useNow } from "./helpers";

type PostResult = { ok: boolean; message: string };
type ConfirmType = "open" | "close" | "settle" | "void" | "delete" | "reopen";

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

export default function FixturesTab({ matches, teamsById, competitionsById, onAction }: {
  matches: Match[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onAction: (path: string, body: unknown, successMessage?: string) => Promise<PostResult>;
}) {
  const now = useNow();
  const [filter, setFilter] = useState<"all" | "active" | "final">("all");
  const [competitionId, setCompetitionId] = useState("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ type: ConfirmType; match: Match } | null>(null);
  const [scores, setScores] = useState({ home: "", away: "" });
  const [busy, setBusy] = useState(false);

  const competitionOptions = useMemo(
    () => Object.values(competitionsById).sort((a, b) => a.name.localeCompare(b.name)),
    [competitionsById]
  );

  // Sorted upcoming-first, then split into labelled sections.
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = sortFixtures(matches, now).filter((m) => {
      if (filter === "active" && isFinal(m)) return false;
      if (filter === "final" && !isFinal(m)) return false;
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
    if (result.ok) closeModal(); // on failure the dialog stays open so you can fix it and retry
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
          <p className="mt-1 text-sm text-adm-muted">{total} {total === 1 ? "match" : "matches"} · upcoming first</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
          {competitionOptions.length > 1 && (
            <Select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} className="w-auto max-w-[11rem]">
              <option value="all">All competitions</option>
              {competitionOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-auto">
            <option value="all">All</option>
            <option value="active">Active</option>
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
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{teamName(m.homeTeamId, teamsById)}</p>
                        <p className="font-medium leading-snug">{teamName(m.awayTeamId, teamsById)}</p>
                        <p className="mt-1 text-xs text-adm-muted">{formatKickoff(m.kickoffAt)} · {competitionName(m.competitionId, competitionsById)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge status={m.status} />
                        {hasScore(m) && <span className="text-sm font-semibold tabular-nums">{m.homeScore} – {m.awayScore}</span>}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.status === "scheduled" && <Button size="sm" onClick={() => setConfirm({ type: "open", match: m })}>Open betting</Button>}
                      {m.status === "open" && (
                        <>
                          <Button size="sm" onClick={() => setConfirm({ type: "settle", match: m })}>Settle</Button>
                          <Button size="sm" variant="secondary" onClick={() => setConfirm({ type: "close", match: m })}>Close betting</Button>
                        </>
                      )}
                      {final && <Button size="sm" variant="secondary" onClick={() => setConfirm({ type: "reopen", match: m })}>Reopen</Button>}
                      {!final && <Button size="sm" variant="danger" onClick={() => setConfirm({ type: "void", match: m })}>Void</Button>}
                      {m.status === "scheduled" && <Button size="sm" variant="ghost" onClick={() => setConfirm({ type: "delete", match: m })}>Delete</Button>}
                    </div>
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
            <Input type="number" inputMode="numeric" min={0} max={99} value={scores.home} onChange={(e) => setScores((s) => ({ ...s, home: e.target.value }))} className="w-20 text-center" />
          </label>
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium">{a}</span>
            <Input type="number" inputMode="numeric" min={0} max={99} value={scores.away} onChange={(e) => setScores((s) => ({ ...s, away: e.target.value }))} className="w-20 text-center" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeModal}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !isValidScore(scores.home) || !isValidScore(scores.away)}>{busy ? "Settling…" : "Settle"}</Button>
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
