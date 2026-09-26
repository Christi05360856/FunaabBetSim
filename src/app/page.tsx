"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Team, Competition, Match } from "@/types/domain";
import { Toast } from "@/components/admin/ui";
import AdminLayout, { AdminThemeProvider, type AdminTabId } from "@/components/admin/AdminLayout";
import OverviewTab from "@/components/admin/OverviewTab";
import FixturesTab, { type FixtureFilter } from "@/components/admin/FixturesTab";
import ImportTab from "@/components/admin/ImportTab";
import DangerTab from "@/components/admin/DangerTab";

type AdminStatus = "checking" | "admin" | "not-admin";
type PostResult = { ok: boolean; message: string };

type ApiBody = {
  message?: string;
  error?: string;
  teamsCreated?: number;
  matchesCreated?: number;
  matchesSkipped?: number;
  alreadySettled?: boolean;
  betsSettled?: number;
  alreadyFinal?: boolean;
  betsRefunded?: number;
};

const plural = (n: number, word: string) => `${n} \( {word} \){n === 1 ? "" : "s"}`;

function summarize(d: ApiBody, fallback: string): string {
  if (d.message) return d.message;
  if (typeof d.matchesCreated === "number") {
    const parts = [`${plural(d.matchesCreated, "fixture")} imported`];
    if (d.matchesSkipped) parts.push(`${plural(d.matchesSkipped, "duplicate")} skipped`);
    if (d.teamsCreated) parts.push(`${plural(d.teamsCreated, "new team")} added`);
    return parts.join(" · ");
  }
  if (d.alreadySettled) return "Already settled — nothing changed";
  if (typeof d.betsSettled === "number") return `Match settled · ${plural(d.betsSettled, "bet")} processed`;
  if (d.alreadyFinal) return "Match was already final — nothing changed";
  if (typeof d.betsRefunded === "number") return `Match voided · ${plural(d.betsRefunded, "bet")} refunded`;
  return fallback;
}

export default function AdminPage() {
  return (
    <AdminThemeProvider>
      <AdminApp />
    </AdminThemeProvider>
  );
}

function AdminApp() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>("checking");
  const [tab, setTab] = useState<AdminTabId>("overview");
  const [fixturesFilter, setFixturesFilter] = useState<FixtureFilter>("all");
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    user
      .getIdTokenResult(true)
      .then((r) => setAdminStatus(r.claims.admin === true ? "admin" : "not-admin"))
      .catch(() => setAdminStatus("not-admin"));
  }, [user, loading, router]);

  useEffect(() => {
    if (adminStatus !== "admin") return;
    const fail = (what: string) => (err: Error) => setToast({ msg: `Could not load ${what}: ${err.message}`, type: "error" });
    const un = [
      onSnapshot(query(collection(db, "teams"), orderBy("name")), (s) => setTeams(s.docs.map((d) => d.data() as Team)), fail("teams")),
      onSnapshot(
        query(collection(db, "competitions"), orderBy("name")),
        (s) => setCompetitions(s.docs.map((d) => d.data() as Competition)),
        fail("competitions")
      ),
      onSnapshot(query(collection(db, "matches"), orderBy("kickoffAt")), (s) => setMatches(s.docs.map((d) => d.data() as Match)), fail("fixtures")),
    ];
    return () => un.forEach((u) => u());
  }, [adminStatus]);

  function report(result: PostResult): PostResult {
    setToast({ msg: result.message, type: result.ok ? "success" : "error" });
    return result;
  }

  async function post(path: string, body: unknown, successMessage = "Done"): Promise<PostResult> {
    if (!user) return report({ ok: false, message: "Not logged in" });
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as ApiBody;
      return report(
        res.ok ? { ok: true, message: summarize(data, successMessage) } : { ok: false, message: data.error ?? `Request failed (${res.status})` }
      );
    } catch {
      return report({ ok: false, message: "Network problem — check your connection and try again" });
    }
  }

  function goToFixtures(filter: FixtureFilter = "all") {
    setFixturesFilter(filter);
    setTab("fixtures");
  }

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])) as Record<string, Team>, [teams]);
  const compsById = useMemo(
    () => Object.fromEntries(competitions.map((c) => [c.id, c])) as Record<string, Competition>,
    [competitions]
  );

  if (loading || adminStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-adm-brand border-t-transparent" />
      </main>
    );
  }

  if (adminStatus === "not-admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold">Access denied</p>
        <p className="text-sm text-adm-muted">This account doesn&apos;t have admin access.</p>
        <Link href="/" className="text-sm font-medium text-adm-brand-ink hover:underline">
          Back to the app
        </Link>
      </main>
    );
  }

  return (
    <>
      <AdminLayout tab={tab} onTabChange={setTab} email={user?.email ?? ""}>
        {tab === "overview" && (
          <OverviewTab
            matches={matches}
            teams={teams}
            competitions={competitions}
            teamsById={teamsById}
            competitionsById={compsById}
            onNavigateToFixtures={goToFixtures}
          />
        )}
        {tab === "fixtures" && (
          <FixturesTab
            matches={matches}
            teamsById={teamsById}
            competitionsById={compsById}
            onAction={post}
            initialFilter={fixturesFilter}
          />
        )}
        {tab === "import" && <ImportTab competitions={competitions} onSubmit={(b) => post("/api/admin/matches/bulk-import", b)} />}
        {tab === "danger" && <DangerTab onReset={() => post("/api/admin/dev/reset", {}, "Platform reset complete")} />}
      </AdminLayout>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
                                                            }
