"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Team, Competition, Match } from "@/types/domain";
import { Icons, Toast } from "@/components/admin/ui";
import OverviewTab from "@/components/admin/OverviewTab";
import FixturesTab from "@/components/admin/FixturesTab";
import OddsTab from "@/components/admin/OddsTab";
import EntitiesTab from "@/components/admin/EntitiesTab";
import ImportTab from "@/components/admin/ImportTab";
import DangerTab from "@/components/admin/DangerTab";

type AdminStatus = "checking" | "admin" | "not-admin";
type PostResult = { ok: boolean; message: string };
type TabId = "overview" | "fixtures" | "odds" | "entities" | "import" | "danger";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>("checking");
  const [tab, setTab] = useState<TabId>("overview");
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    user.getIdTokenResult(true).then((r) => setAdminStatus(r.claims.admin === true ? "admin" : "not-admin"));
  }, [user, loading, router]);

  useEffect(() => {
    if (adminStatus !== "admin") return;
    const un = [
      onSnapshot(query(collection(db, "teams"), orderBy("name")), (s) => setTeams(s.docs.map((d) => d.data() as Team))),
      onSnapshot(query(collection(db, "competitions"), orderBy("name")), (s) => setCompetitions(s.docs.map((d) => d.data() as Competition))),
      onSnapshot(query(collection(db, "matches"), orderBy("kickoffAt", "desc")), (s) => setMatches(s.docs.map((d) => d.data() as Match))),
    ];
    return () => un.forEach((u) => u());
  }, [adminStatus]);

  async function post(path: string, body: unknown): Promise<PostResult> {
    if (!user) return { ok: false, message: "Not logged in" };
    const res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const result = res.ok ? { ok: true, message: data.message ?? "Done" } : { ok: false, message: data.error ?? "Error" };
    setToast({ msg: result.message, type: result.ok ? "success" : "error" });
    return result;
  }

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const compsById = useMemo(() => Object.fromEntries(competitions.map((c) => [c.id, c])), [competitions]);

  const tabs = [
    { id: "overview", label: "Overview", icon: Icons.dashboard },
    { id: "fixtures", label: "Fixtures", icon: Icons.fixtures },
    { id: "odds", label: "Odds", icon: Icons.odds },
    { id: "entities", label: "Teams", icon: Icons.entities },
    { id: "import", label: "Import", icon: Icons.import },
    { id: "danger", label: "Danger", icon: Icons.danger },
  ] as const;

  if (loading || adminStatus === "checking") return <main className="flex min-h-screen items-center justify-center bg-zinc-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" /></main>;
  if (adminStatus === "not-admin") return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">Access Denied</main>;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-bold">F</div>
            <div><h1 className="font-semibold">FUNAAB BetSim</h1><p className="text-xs text-zinc-500">Admin</p></div>
          </div>
          <span className="text-sm text-zinc-400">{user?.email}</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-48 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${tab === t.id ? "bg-emerald-600/10 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800/50"}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 pb-20 md:pb-0">
          {tab === "overview" && <OverviewTab matches={matches} teams={teams} competitions={competitions} />}
          {tab === "fixtures" && <FixturesTab matches={matches} teamsById={teamsById} competitionsById={compsById} onAction={post} />}
          {tab === "odds" && <OddsTab matches={matches} teamsById={teamsById} competitionsById={compsById} onSubmit={(b) => post("/api/admin/markets", b)} />}
          {tab === "entities" && <EntitiesTab teams={teams} competitions={competitions} onAddTeam={(b) => post("/api/admin/teams", b)} onAddCompetition={(b) => post("/api/admin/competitions", b)} />}
          {tab === "import" && <ImportTab onSubmit={(b) => post("/api/admin/matches/bulk-import", b)} />}
          {tab === "danger" && <DangerTab onReset={() => post("/api/admin/dev/reset", {})} />}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-800 bg-zinc-950/90 backdrop-blur md:hidden">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${tab === t.id ? "text-emerald-400" : "text-zinc-500"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </nav>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
