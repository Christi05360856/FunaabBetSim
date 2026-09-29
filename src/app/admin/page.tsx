"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Team, Competition, Match } from "@/types/domain";
import { Toast } from "@/components/admin/ui";
import AdminLayout, { AdminThemeProvider, type AdminTabId } from "@/components/admin/AdminLayout";
import OverviewTab from "@/components/admin/OverviewTab";
import FixturesTab from "@/components/admin/FixturesTab";
import ImportTab from "@/components/admin/ImportTab";
import DangerTab from "@/components/admin/DangerTab";

type AdminStatus = "checking" | "admin" | "not-admin";
type PostResult = { ok: boolean; message: string };

// Shape of the JSON our /api/admin/* routes send back.
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Turns the API's raw counts into a readable toast message.
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
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    user
      .getIdTokenResult(true)
      .then((r) => setAdminStatus(r.claims.admin === true ? "admin" : "not-admin"))
      .catch(() => setAdminStatus("not-admin"));
  }, [user, loading, router]);

  // One-time fetch (not live listeners). Called on load and after every
  // successful admin action, so the screen always reflects the latest data
  // without keeping 3 collections streaming in the background.
  const loadAll = useCallback(async () => {
    try {
      const [t, c, m] = await Promise.all([
        getDocs(query(collection(db, "teams"), orderBy("name"))),
        getDocs(query(collection(db, "competitions"), orderBy("name"))),
        // Display order is decided in the tabs (upcoming first); this just keeps it stable.
        getDocs(query(collection(db, "matches"), orderBy("kickoffAt"))),
      ]);
      setTeams(t.docs.map((d) => d.data() as Team));
      setCompetitions(c.docs.map((d) => d.data() as Competition));
      setMatches(m.docs.map((d) => d.data() as Match));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setToast({ msg: `Could not load data: ${message}`, type: "error" });
    }
  }, []);

  useEffect(() => {
    if (adminStatus !== "admin") return;
    void loadAll();
  }, [adminStatus, loadAll]);

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
      const result = report(
        res.ok
          ? { ok: true, message: summarize(data, successMessage) }
          : { ok: false, message: data.error ?? `Request failed (${res.status})` }
      );
      if (res.ok) await loadAll();
      return result;
    } catch {
      return report({ ok: false, message: "Network problem — check your connection and try again" });
    }
  }

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])) as Record<string, Team>, [teams]);
  const compsById = useMemo(() => Object.fromEntries(competitions.map((c) => [c.id, c])) as Record<string, Competition>, [competitions]);

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
        <Link href="/" className="text-sm font-medium text-adm-brand-ink hover:underline">Back to the app</Link>
      </main>
    );
  }

  return (
    <>
      <AdminLayout tab={tab} onTabChange={setTab} email={user?.email ?? ""}>
        {tab === "overview" && (
          <OverviewTab matches={matches} teams={teams} competitions={competitions} teamsById={teamsById} competitionsById={compsById} onViewFixtures={() => setTab("fixtures")} />
        )}
        {tab === "fixtures" && (
          <FixturesTab matches={matches} teamsById={teamsById} competitionsById={compsById} onAction={post} />
        )}
        {tab === "import" && (
          <ImportTab
            competitions={competitions}
            matches={matches}
            teamsById={teamsById}
            onSubmit={(b) => post("/api/admin/matches/bulk-import", b)}
            onGenerateOdds={(b) => post("/api/admin/markets/bulk-generate", b)}
          />
        )}
        {tab === "danger" && (
          <DangerTab />
        )}
      </AdminLayout>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
