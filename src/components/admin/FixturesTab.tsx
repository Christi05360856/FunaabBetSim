"use client";

import { useMemo, useState } from "react";
import type { Team, Competition, Match } from "@/types/domain";
import { Card, Badge, Button, Input, Select, Modal, ConfirmModal } from "./ui";

type PostResult = { ok: boolean; message: string };
type ConfirmType = "open" | "close" | "settle" | "void" | "delete" | "reopen";

export default function FixturesTab({ matches, teamsById, competitionsById, onAction }: { 
  matches: Match[]; 
  teamsById: Record<string, Team>; 
  competitionsById: Record<string, Competition>; 
  onAction: (path: string, body: unknown) => Promise<PostResult> 
}) {
  const [filter, setFilter] = useState<"all" | "active" | "final">("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ type: ConfirmType; match: Match } | null>(null);
  const [scores, setScores] = useState({ home: "", away: "" });
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    let list = matches;
    if (filter === "active") list = list.filter((m) => !["settled", "voided"].includes(m.status));
    if (filter === "final") list = list.filter((m) => ["settled", "voided"].includes(m.status));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => (teamsById[m.homeTeamId]?.name?.toLowerCase() ?? "").includes(q) || (teamsById[m.awayTeamId]?.name?.toLowerCase() ?? "").includes(q));
    }
    return list;
  }, [matches, filter, search, teamsById]);

  async function handleConfirm() {
    if (!confirm) return;
    setBusy(true);
    const endpoints: Record<ConfirmType, string> = {
      open: "/api/admin/matches/open",
      close: "/api/admin/matches/close",
      settle: "/api/admin/matches/settle",
      void: "/api/admin/matches/void",
      delete: "/api/admin/matches/delete",
      reopen: "/api/admin/matches/reopen",
    };
    const body: Record<string, unknown> = { matchId: confirm.match.id };
    if (confirm.type === "settle") { body.homeScore = Number(scores.home); body.awayScore = Number(scores.away); }
    await onAction(endpoints[confirm.type], body);
    setBusy(false); setConfirm(null); setScores({ home: "", away: "" });
  }

  const getContent = () => {
    if (!confirm) return { title: "", message: "", label: "" };
    const h = teamsById[confirm.match.homeTeamId]?.name ?? "?";
    const a = teamsById[confirm.match.awayTeamId]?.name ?? "?";
    switch (confirm.type) {
      case "open": return { title: "Open Betting", message: `Open betting for ${h} vs ${a}?`, label: "Open" };
      case "close": return { title: "Close Betting", message: `Close betting and return to scheduled?`, label: "Close" };
      case "void": return { title: "Void Match", message: `Void ${h} vs ${a} and refund all bets?`, label: "Void" };
      case "delete": return { title: "Delete", message: `Delete ${h} vs ${a}? Only works if no bets exist.`, label: "Delete" };
      case "reopen": return { title: "Reopen", message: `Revert ${h} vs ${a} to open? Scores will be cleared.`, label: "Reopen" };
      default: return { title: "", message: "", label: "" };
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-bold">Fixtures</h2><p className="mt-1 text-sm text-zinc-500">{filtered.length} matches</p></div>
        <div className="flex gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-40" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-28">
            <option value="all">All</option><option value="active">Active</option><option value="final">Final</option>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase text-zinc-500">
              <tr><th className="px-4 py-3">Match</th><th className="px-4 py-3">Competition</th><th className="px-4 py-3">Kickoff</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((m) => {
                const home = teamsById[m.homeTeamId]; const away = teamsById[m.awayTeamId];
                const isFinal = ["settled", "voided"].includes(m.status);
                return (
                  <tr key={m.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{home?.shortName ?? "?"} <span className="text-zinc-500">vs</span> {away?.shortName ?? "?"}</div>
                      <div className="text-xs text-zinc-500">{home?.name} vs {away?.name}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{competitionsById[m.competitionId]?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-400">{new Date(m.kickoffAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3"><Badge status={m.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {m.status === "scheduled" && <Button size="sm" onClick={() => setConfirm({ type: "open", match: m })}>Open</Button>}
                        {m.status === "open" && <>
                          <Button size="sm" variant="secondary" onClick={() => setConfirm({ type: "close", match: m })}>Close</Button>
                          <Button size="sm" onClick={() => setConfirm({ type: "settle", match: m })}>Settle</Button>
                        </>}
                        {isFinal && <Button size="sm" variant="secondary" onClick={() => setConfirm({ type: "reopen", match: m })}>Reopen</Button>}
                        {!isFinal && <Button size="sm" variant="danger" onClick={() => setConfirm({ type: "void", match: m })}>Void</Button>}
                        {m.status === "scheduled" && <Button size="sm" variant="ghost" onClick={() => setConfirm({ type: "delete", match: m })}>×</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={confirm?.type === "settle"} onClose={() => setConfirm(null)} title="Settle Match">
        <div className="mb-4 flex gap-3">
          <div className="flex-1"><label className="mb-1 block text-xs text-zinc-500">Home</label><Input type="number" value={scores.home} onChange={(e) => setScores(s => ({ ...s, home: e.target.value }))} /></div>
          <div className="flex-1"><label className="mb-1 block text-xs text-zinc-500">Away</label><Input type="number" value={scores.away} onChange={(e) => setScores(s => ({ ...s, away: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !scores.home || !scores.away}>{busy ? "…" : "Settle"}</Button>
        </div>
      </Modal>

      <ConfirmModal open={confirm !== null && confirm.type !== "settle"} onClose={() => setConfirm(null)} onConfirm={handleConfirm} {...getContent()} danger={["void", "delete"].includes(confirm?.type ?? "")} loading={busy} />
    </div>
  );
}

