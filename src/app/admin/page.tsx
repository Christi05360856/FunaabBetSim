"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Team, Competition, Match } from "@/types/domain";

type AdminStatus = "checking" | "admin" | "not-admin";
type PostResult = { ok: boolean; message: string };

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>("checking");
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    user.getIdTokenResult(true).then((result) => {
      setAdminStatus(result.claims.admin === true ? "admin" : "not-admin");
    });
  }, [user, loading, router]);

  useEffect(() => {
    if (adminStatus !== "admin") return;
    const unsubTeams = onSnapshot(query(collection(db, "teams"), orderBy("name")), (snap) =>
      setTeams(snap.docs.map((d) => d.data() as Team))
    );
    const unsubCompetitions = onSnapshot(
      query(collection(db, "competitions"), orderBy("name")),
      (snap) => setCompetitions(snap.docs.map((d) => d.data() as Competition))
    );
    const unsubMatches = onSnapshot(
      query(collection(db, "matches"), orderBy("kickoffAt")),
      (snap) => setMatches(snap.docs.map((d) => d.data() as Match))
    );
    return () => {
      unsubTeams();
      unsubCompetitions();
      unsubMatches();
    };
  }, [adminStatus]);

  async function authedPost(path: string, body: unknown): Promise<PostResult> {
    if (!user) return { ok: false, message: "Not logged in." };
    const idToken = await user.getIdToken();
    const response = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    return response.ok
      ? { ok: true, message: "Saved." }
      : { ok: false, message: responseBody.error ?? "Something went wrong." };
  }

  if (loading || adminStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  if (adminStatus === "not-admin") {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-ink">
        You don&apos;t have access to this page.
      </main>
    );
  }

  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">Admin panel</h1>
      <TeamForm onSubmit={(body) => authedPost("/api/admin/teams", body)} />
      <CompetitionForm onSubmit={(body) => authedPost("/api/admin/competitions", body)} />
      <MatchForm
        teams={teams}
        competitions={competitions}
        onSubmit={(body) => authedPost("/api/admin/matches", body)}
      />
      <MarketForm
        matches={matches}
        teamsById={teamsById}
        competitionsById={Object.fromEntries(competitions.map((c) => [c.id, c]))}
        onSubmit={(body) => authedPost("/api/admin/markets", body)}
      />
      <MatchStatusList
        matches={matches}
        teamsById={teamsById}
        onOpen={(matchId) => authedPost("/api/admin/matches/open", { matchId })}
        onSettle={(matchId, homeScore, awayScore) =>
          authedPost("/api/admin/matches/settle", { matchId, homeScore, awayScore })
        }
        onVoid={(matchId) => authedPost("/api/admin/matches/void", { matchId })}
      />
      <BulkImportForm onSubmit={(body) => authedPost("/api/admin/matches/bulk-import", body)} />
    </main>
  );
}

function TeamForm({ onSubmit }: { onSubmit: (body: unknown) => Promise<PostResult> }) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await onSubmit({ name, shortName });
    setStatus(result.message);
    if (result.ok) {
      setName("");
      setShortName("");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">Add team</h2>
      <input
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        placeholder="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        placeholder="Short name (e.g. COE)"
        value={shortName}
        onChange={(e) => setShortName(e.target.value)}
      />
      <button
        type="submit"
        disabled={submitting || !name || !shortName}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Add team"}
      </button>
      {status && <p className="text-sm text-ink-muted">{status}</p>}
    </form>
  );
}

function CompetitionForm({ onSubmit }: { onSubmit: (body: unknown) => Promise<PostResult> }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await onSubmit({ name });
    setStatus(result.message);
    if (result.ok) setName("");
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">Add competition</h2>
      <input
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        placeholder="Competition name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="submit"
        disabled={submitting || !name}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Add competition"}
      </button>
      {status && <p className="text-sm text-ink-muted">{status}</p>}
    </form>
  );
}

function MatchForm({
  teams,
  competitions,
  onSubmit,
}: {
  teams: Team[];
  competitions: Competition[];
  onSubmit: (body: unknown) => Promise<PostResult>;
}) {
  const [competitionId, setCompetitionId] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const kickoffAt = new Date(kickoff).getTime();
    const result = await onSubmit({ competitionId, homeTeamId, awayTeamId, kickoffAt });
    setStatus(result.message);
    if (result.ok) {
      setHomeTeamId("");
      setAwayTeamId("");
      setKickoff("");
    }
    setSubmitting(false);
  }

  const ready = competitionId && homeTeamId && awayTeamId && kickoff;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">Add match</h2>

      <select
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        value={competitionId}
        onChange={(e) => setCompetitionId(e.target.value)}
      >
        <option value="">Select competition</option>
        {competitions.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        value={homeTeamId}
        onChange={(e) => setHomeTeamId(e.target.value)}
      >
        <option value="">Home team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <select
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        value={awayTeamId}
        onChange={(e) => setAwayTeamId(e.target.value)}
      >
        <option value="">Away team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <input
        type="datetime-local"
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        value={kickoff}
        onChange={(e) => setKickoff(e.target.value)}
      />

      <button
        type="submit"
        disabled={submitting || !ready}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Add match"}
      </button>
      {status && <p className="text-sm text-ink-muted">{status}</p>}
    </form>
  );
}

function MarketForm({
  matches,
  teamsById,
  competitionsById,
  onSubmit,
}: {
  matches: Match[];
  teamsById: Record<string, Team>;
  competitionsById: Record<string, Competition>;
  onSubmit: (body: unknown) => Promise<PostResult>;
}) {
  const [matchId, setMatchId] = useState("");
  const [homeOdds, setHomeOdds] = useState("");
  const [drawOdds, setDrawOdds] = useState("");
  const [awayOdds, setAwayOdds] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await onSubmit({
      matchId,
      homeOdds: Number(homeOdds),
      drawOdds: Number(drawOdds),
      awayOdds: Number(awayOdds),
    });
    setStatus(result.message);
    if (result.ok) {
      setHomeOdds("");
      setDrawOdds("");
      setAwayOdds("");
    }
    setSubmitting(false);
  }

  const ready = matchId && homeOdds && drawOdds && awayOdds;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">Set odds (Match Winner)</h2>

      <select
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        value={matchId}
        onChange={(e) => setMatchId(e.target.value)}
      >
        <option value="">Select match</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {competitionsById[m.competitionId]?.name ?? "?"} · {teamsById[m.homeTeamId]?.shortName ?? "?"} vs{" "}
            {teamsById[m.awayTeamId]?.shortName ?? "?"} ·{" "}
            {new Date(m.kickoffAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="1.01"
          className="w-1/3 rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
          placeholder="Home"
          value={homeOdds}
          onChange={(e) => setHomeOdds(e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          min="1.01"
          className="w-1/3 rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
          placeholder="Draw"
          value={drawOdds}
          onChange={(e) => setDrawOdds(e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          min="1.01"
          className="w-1/3 rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
          placeholder="Away"
          value={awayOdds}
          onChange={(e) => setAwayOdds(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !ready}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Set odds"}
      </button>
      {status && <p className="text-sm text-ink-muted">{status}</p>}
    </form>
  );
         }

function MatchStatusList({
  matches,
  teamsById,
  onOpen,
  onSettle,
  onVoid,
}: {
  matches: Match[];
  teamsById: Record<string, Team>;
  onOpen: (matchId: string) => Promise<PostResult>;
  onSettle: (matchId: string, homeScore: number, awayScore: number) => Promise<PostResult>;
  onVoid: (matchId: string) => Promise<PostResult>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [scoresById, setScoresById] = useState<Record<string, { home: string; away: string }>>({});

  async function handleOpen(matchId: string) {
    setBusyId(matchId);
    const result = await onOpen(matchId);
    setStatusById((prev) => ({ ...prev, [matchId]: result.message }));
    setBusyId(null);
  }

  async function handleSettle(matchId: string) {
    const scores = scoresById[matchId];
    if (!scores || scores.home === "" || scores.away === "") return;
    setBusyId(matchId);
    const result = await onSettle(matchId, Number(scores.home), Number(scores.away));
    setStatusById((prev) => ({ ...prev, [matchId]: result.message }));
    setBusyId(null);
  }

  async function handleVoid(matchId: string) {
    setBusyId(matchId);
    const result = await onVoid(matchId);
    setStatusById((prev) => ({ ...prev, [matchId]: result.message }));
    setBusyId(null);
  }

  function updateScore(matchId: string, side: "home" | "away", value: string) {
    setScoresById((prev) => ({
      ...prev,
      [matchId]: { home: prev[matchId]?.home ?? "", away: prev[matchId]?.away ?? "", [side]: value },
    }));
  }

  return (
    <div className="rounded-xl bg-surface p-5">
      <h2 className="mb-3 font-display text-lg font-semibold">Match status</h2>
      <div className="flex flex-col divide-y divide-ink-muted/20">
        {matches.map((m) => {
          const scores = scoresById[m.id] ?? { home: "", away: "" };
          const isFinal = m.status === "settled" || m.status === "voided";

          return (
            <div key={m.id} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {teamsById[m.homeTeamId]?.shortName ?? "?"} v{" "}
                    {teamsById[m.awayTeamId]?.shortName ?? "?"}
                  </p>
                  <p className="text-xs capitalize text-ink-muted">
                    {m.status} {statusById[m.id] ? `· ${statusById[m.id]}` : ""}
                  </p>
                </div>
                {m.status === "scheduled" && (
                  <button
                    onClick={() => handleOpen(m.id)}
                    disabled={busyId === m.id}
                    className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busyId === m.id ? "…" : "Open betting"}
                  </button>
                )}
              </div>

              {m.status === "open" && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Home score"
                    value={scores.home}
                    onChange={(e) => updateScore(m.id, "home", e.target.value)}
                    className="w-24 rounded-lg border border-ink-muted bg-transparent px-2 py-1.5 text-sm text-ink"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Away score"
                    value={scores.away}
                    onChange={(e) => updateScore(m.id, "away", e.target.value)}
                    className="w-24 rounded-lg border border-ink-muted bg-transparent px-2 py-1.5 text-sm text-ink"
                  />
                  <button
                    onClick={() => handleSettle(m.id)}
                    disabled={busyId === m.id || scores.home === "" || scores.away === ""}
                    className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busyId === m.id ? "…" : "Confirm result & settle"}
                  </button>
                </div>
              )}

              {!isFinal && (
                <button
                  onClick={() => handleVoid(m.id)}
                  disabled={busyId === m.id}
                  className="self-start text-xs text-loss underline disabled:opacity-50"
                >
                  Void this match (refund all bets)
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BulkImportForm({ onSubmit }: { onSubmit: (body: unknown) => Promise<PostResult> }) {
  const [competitionName, setCompetitionName] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((line) => {
    const parts = line.split(";").map((p) => p.trim());
    if (parts.length !== 3) return { line, error: "Expected 3 parts separated by ;" };
    const [homeTeam, awayTeam, dateStr] = parts;
    const kickoffAt = new Date(dateStr!.replace(" ", "T")).getTime();
    if (!homeTeam || !awayTeam || Number.isNaN(kickoffAt)) {
      return { line, error: "Could not read team names or date/time" };
    }
    return { homeTeam, awayTeam, kickoffAt };
  });
  const validMatches = parsed.filter(
    (p): p is { homeTeam: string; awayTeam: string; kickoffAt: number } => !("error" in p)
  );
  const errorLines = parsed.filter((p): p is { line: string; error: string } => "error" in p);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await onSubmit({ competitionName, matches: validMatches });
    setStatus(result.message);
    if (result.ok) {
      setText("");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">Bulk import fixtures</h2>
      <p className="text-xs text-ink-muted">
        One match per line: <code>Home Team; Away Team; YYYY-MM-DD HH:mm</code>
        <br />
        Unrecognized teams and this competition are created automatically.
      </p>

      <input
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 text-ink"
        placeholder="Competition name"
        value={competitionName}
        onChange={(e) => setCompetitionName(e.target.value)}
      />

      <textarea
        rows={8}
        className="rounded-lg border border-ink-muted bg-transparent px-3 py-2 font-mono text-xs text-ink"
        placeholder={"Alpha Archivers; Legend fc; 2026-09-26 05:00\nDynamo FC; Knight Fc; 2026-09-26 06:00"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {lines.length > 0 && (
        <p className="text-xs text-ink-muted">
          {validMatches.length} match{validMatches.length === 1 ? "" : "es"} ready
          {errorLines.length > 0 && `, ${errorLines.length} line(s) with a problem`}
        </p>
      )}
      {errorLines.length > 0 && (
        <ul className="rounded-lg bg-loss/10 p-2 text-xs text-loss">
          {errorLines.map((e, i) => (
            <li key={i} className="truncate">
              "{e.line}" — {e.error}
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting || !competitionName || validMatches.length === 0}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Importing…" : `Import ${validMatches.length || ""} match${validMatches.length === 1 ? "" : "es"}`}
      </button>
      {status && <p className="text-sm text-ink-muted">{status}</p>}
    </form>
  );
}
