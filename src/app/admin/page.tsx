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
    user.getIdTokenResult().then((result) => {
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
        onSubmit={(body) => authedPost("/api/admin/markets", body)}
      />
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
  onSubmit,
}: {
  matches: Match[];
  teamsById: Record<string, Team>;
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
            {teamsById[m.homeTeamId]?.shortName ?? "?"} vs{" "}
            {teamsById[m.awayTeamId]?.shortName ?? "?"} ·{" "}
            {new Date(m.kickoffAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
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
