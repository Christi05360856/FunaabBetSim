"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Card, CardHeader, Badge, Button, EmptyState } from "./ui";

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
          right={
            <Badge tone="muted">{events.length} recent</Badge>
          }
        />
        {events.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-adm-muted">
            No events yet. Place a bet, deposit, or hit a rate limit to see rows here.
          </p>
        ) : (
          <ul className="divide-y divide-adm-border max-h-96 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-adm-ink">
                    {e.type || "EVENT"}
                  </span>
                  <span className="text-adm-faint">{timeAgo(e.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-adm-muted break-all">
                  {e.uid ? `uid ${String(e.uid).slice(0, 10)}…` : "no uid"}
                  {e.ip ? ` · ${e.ip}` : ""}
                  {e.meta && Object.keys(e.meta).length > 0
                    ? ` · ${JSON.stringify(e.meta).slice(0, 80)}`
                    : ""}
                </div>
              </li>
            ))}
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
