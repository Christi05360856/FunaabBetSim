"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, CardHeader, Button, EmptyState } from "./ui";

type Stats = {
  generatedAt: number;
  users: { registered: number };
  wallets: { count: number };
  bets: { open: number };
  withdrawals: { pendingCount: number; pendingAmountSample: number };
  depositsToday: { count: number; amountNgn: number; note?: string };
  liability: {
    walletsScanned: number;
    purchased: number;
    promo: number;
    reservedStake: number;
    reservedWithdrawal: number;
    displayBalance: number;
    totalCashAtRisk: number;
  };
  security: { rateLimitEventsTotal: number; hasEventsToday: boolean };
};

type SecEvent = {
  id: string;
  type?: string;
  uid?: string | null;
  ip?: string | null;
  createdAt?: number;
  meta?: Record<string, unknown>;
};

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

function timeAgo(ts?: number) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}


function secStyle(type?: string): { label: string; cls: string; tone: string } {
  const t = (type || "EVENT").toUpperCase();
  if (t.includes("PIN_FAIL") || t.includes("FORBIDDEN") || t.includes("RATE"))
    return { label: t.replace(/_/g, " "), cls: "bg-rose-500/15 text-rose-700 border-rose-500/30", tone: "risk" };
  if (t.includes("WITHDRAW"))
    return { label: t.replace(/_/g, " "), cls: "bg-sky-500/15 text-sky-700 border-sky-500/30", tone: "money" };
  if (t.includes("DEPOSIT"))
    return { label: t.replace(/_/g, " "), cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", tone: "money" };
  if (t.includes("BOOK"))
    return { label: t.replace(/_/g, " "), cls: "bg-violet-500/15 text-violet-700 border-violet-500/30", tone: "ok" };
  if (t.includes("BET") || t.includes("PLACE"))
    return { label: t.replace(/_/g, " "), cls: "bg-brand/15 text-brand border-brand/30", tone: "ok" };
  return { label: t.replace(/_/g, " "), cls: "bg-adm-border/50 text-adm-ink border-adm-border", tone: "ok" };
}

function secSummary(e: SecEvent): string {
  const m = e.meta || {};
  const bits: string[] = [];
  if (m.amount != null) bits.push(`₦${Number(m.amount).toLocaleString("en-NG")}`);
  if (m.code != null) bits.push(`code ${m.code}`);
  if (m.legCount != null) bits.push(`${m.legCount} leg(s)`);
  if (m.totalOdds != null) bits.push(`odds ${m.totalOdds}`);
  if (m.matchId != null) bits.push(`match ${String(m.matchId).slice(0, 10)}…`);
  if (bits.length) return bits.join(" · ");
  if (m && Object.keys(m).length)
    return Object.entries(m)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  return "Security event";
}


export default function PlatformTab() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<SecEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [sRes, eRes] = await Promise.all([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/security-events?limit=40", { headers }),
      ]);
      const sBody = await sRes.json().catch(() => ({}));
      const eBody = await eRes.json().catch(() => ({}));
      if (!sRes.ok) {
        setError((sBody as { error?: string }).error || `Stats failed (${sRes.status})`);
        setStats(null);
      } else {
        setStats(sBody as Stats);
      }
      if (eRes.ok) {
        setEvents(((eBody as { events?: SecEvent[] }).events) || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-adm-brand border-t-transparent" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <EmptyState
        title="Could not load platform stats"
        hint={error}
      />
    );
  }

  const L = stats?.liability;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-adm-ink">Platform</h2>
          <p className="text-xs text-adm-muted">
            Users, liability, and security signals · Phase 2
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-adm-warn/40 bg-adm-warn/10 px-3 py-2 text-xs text-adm-warn">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Registered users" value={String(stats?.users.registered ?? "—")} />
        <Stat label="Wallets" value={String(stats?.wallets.count ?? "—")} />
        <Stat label="Open bets" value={String(stats?.bets.open ?? "—")} />
        <Stat
          label="Pending withdrawals"
          value={String(stats?.withdrawals.pendingCount ?? "—")}
          sub={
            stats
              ? naira(stats.withdrawals.pendingAmountSample)
              : undefined
          }
        />
        <Stat
          label="Deposits today"
          value={String(stats?.depositsToday.count ?? "—")}
          sub={stats ? naira(stats.depositsToday.amountNgn) : undefined}
        />
        <Stat
          label="Cash (purchased)"
          value={L ? naira(L.purchased) : "—"}
        />
        <Stat label="Promo liability" value={L ? naira(L.promo) : "—"} />
        <Stat
          label="Total at risk"
          value={L ? naira(L.totalCashAtRisk) : "—"}
          highlight
        />
      </div>

      {L && (
        <Card>
          <CardHeader title="Wallet liability detail" />
          <div className="grid grid-cols-2 gap-2 px-3 pb-3 text-xs text-adm-muted sm:grid-cols-3">
            <div>Reserved stake: <span className="text-adm-ink">{naira(L.reservedStake)}</span></div>
            <div>Reserved withdrawal: <span className="text-adm-ink">{naira(L.reservedWithdrawal)}</span></div>
            <div>Display balance sum: <span className="text-adm-ink">{naira(L.displayBalance)}</span></div>
            <div>Wallets scanned: <span className="text-adm-ink">{L.walletsScanned}</span></div>
            <div>
              Rate-limit events (all time):{" "}
              <span className="text-adm-ink">
                {stats?.security.rateLimitEventsTotal ?? "—"}
              </span>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Security events"
          action={
            <span className="text-[11px] text-adm-muted">{events.length} recent</span>
          }
        />
        {events.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-adm-muted">
            No events yet. Place a bet, deposit, or hit a rate limit to see rows here.
          </p>
        ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto px-2 pb-3">
            {events.map((e) => {
              const style = secStyle(e.type);
              const summary = secSummary(e);
              return (
                <li
                  key={e.id}
                  className="rounded-xl border border-adm-border bg-adm-card px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={
                        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide " +
                        style.cls
                      }
                    >
                      {style.label}
                    </span>
                    <span className="text-[11px] font-medium text-adm-faint">
                      {timeAgo(e.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-adm-ink">{summary}</p>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-adm-muted">
                    <span>{e.uid ? "User " + String(e.uid).slice(0, 10) + "…" : "No user"}</span>
                    {e.ip ? <span>· IP {e.ip}</span> : null}
                  </div>
                  {e.meta && Object.keys(e.meta).length > 0 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[10px] font-semibold text-brand">
                        Raw payload
                      </summary>
                      <pre className="mt-1 max-h-28 overflow-auto rounded-lg bg-adm-bg p-1.5 text-[10px] text-adm-muted whitespace-pre-wrap break-all">
                        {JSON.stringify(e.meta, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        highlight
          ? "border-adm-brand/40 bg-adm-brand/10"
          : "border-adm-border bg-adm-card"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-adm-muted">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-adm-ink">{value}</p>
      {sub ? <p className="text-[11px] text-adm-muted">{sub}</p> : null}
    </div>
  );
        }
