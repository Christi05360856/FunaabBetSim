"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  CASINO_GAMES,
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  CASINO_RELOAD_CHIPS,
  CASINO_START_CHIPS,
  type CasinoGameId,
} from "@/types/casino";

type BalancePayload = {
  ok?: boolean;
  balance?: number;
  canReload?: boolean;
  reloadReason?: string | null;
  retryAfterMs?: number;
  error?: string;
};

type PlayRow = {
  id: string;
  game: string;
  stake: number;
  payout: number;
  profit: number;
  createdAt: number;
  won: boolean;
};

type HistoryPayload = {
  ok?: boolean;
  plays?: PlayRow[];
  stats?: { plays: number; wins: number; losses: number; net: number };
  error?: string;
};

type CategoryId = "all" | "quick" | "crash" | "table" | "funaab";

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "quick", label: "Quick" },
  { id: "crash", label: "Crash" },
  { id: "table", label: "Chance" },
  { id: "funaab", label: "FUNAAB" },
];

const CATEGORY_GAMES: Record<CategoryId, CasinoGameId[] | null> = {
  all: null,
  quick: ["dice", "coin", "thimbles", "penalty"],
  crash: ["crash", "campus-crash"],
  table: ["wheel", "mines"],
  funaab: ["campus-crash", "penalty", "thimbles"],
};

const ICONS: Record<string, string> = {
  dice: "🎲",
  coin: "🪙",
  mines: "💣",
  wheel: "🎡",
  crash: "📈",
  thimbles: "🥛",
  "campus-crash": "🚌",
  penalty: "🥅",
};

const GAME_NAMES: Record<string, string> = Object.fromEntries(
  CASINO_GAMES.map((g) => [g.id, g.name])
);

function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

function cooldown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m <= 0 ? `${r}s` : `${m}m ${r.toString().padStart(2, "0")}s`;
}

function formatTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function featuredGameId(): CasinoGameId {
  const ready = CASINO_GAMES.filter((g) => g.playReady);
  if (ready.length === 0) return "dice";
  const day = Math.floor(Date.now() / 86_400_000);
  return ready[day % ready.length]!.id;
}

export default function CasinoPage() {
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [canReload, setCanReload] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"games" | "history">("games");
  const [histFilter, setHistFilter] = useState<"all" | "wins" | "losses">("all");
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [stats, setStats] = useState({ plays: 0, wins: 0, losses: 0, net: 0 });
  const [histLoading, setHistLoading] = useState(false);

  const loadBalance = useCallback(async () => {
    if (!user) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/balance", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json()) as BalancePayload;
      if (!res.ok) throw new Error(data.error || "Could not load balance");
      setBalance(typeof data.balance === "number" ? data.balance : 0);
      setCanReload(!!data.canReload);
      setRetryAfterMs(data.retryAfterMs ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setPlays([]);
      return;
    }
    setHistLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/casino/history?filter=${histFilter}&limit=40`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      const data = (await res.json()) as HistoryPayload;
      if (!res.ok) throw new Error(data.error || "Could not load history");
      setPlays(data.plays ?? []);
      if (data.stats) setStats(data.stats);
    } catch {
      /* keep last */
    } finally {
      setHistLoading(false);
    }
  }, [user, histFilter]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    if (retryAfterMs <= 0) return;
    const t = setInterval(() => {
      setRetryAfterMs((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) setCanReload(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [retryAfterMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onReload() {
    if (!user || reloading) return;
    setReloading(true);
    setMsg(null);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/casino/reload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reload failed");
      setBalance(
        typeof data.balance === "number"
          ? data.balance
          : typeof data.wallet?.balance === "number"
            ? data.wallet.balance
            : CASINO_RELOAD_CHIPS
      );
      setCanReload(false);
      setRetryAfterMs(0);
      setMsg(`+${chips(CASINO_RELOAD_CHIPS)} chips reloaded`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reload failed");
    } finally {
      setReloading(false);
    }
  }

  const featuredId = useMemo(() => featuredGameId(), []);
  const featured = CASINO_GAMES.find((g) => g.id === featuredId);

  const filteredGames = useMemo(() => {
    const allow = CATEGORY_GAMES[category];
    let list = CASINO_GAMES.filter((g) => g.playReady);
    if (allow) list = list.filter((g) => allow.includes(g.id));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.blurb.toLowerCase().includes(q) ||
          g.id.includes(q)
      );
    }
    return list;
  }, [category, query]);

  if (authLoading) {
    return (
      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        <div className="h-28 animate-pulse rounded-2xl bg-ink-muted/10" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 pb-28 text-center">
        <p className="text-lg font-bold text-ink">Casino is demo-only</p>
        <p className="text-sm text-ink-muted">
          Log in to play with free chips. Chips are never withdrawable.
        </p>
        <Link
          href="/login"
          className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white"
        >
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-4">
      {/* Demo banner */}
      <div className="mb-3 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-center text-[11px] font-semibold text-brand">
        PLAY FOR FREE · Demo chips only · Not real money
      </div>

      {/* Chip wallet */}
      <section className="rounded-2xl border border-ink-muted/12 bg-surface p-4 shadow-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          Casino chips
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
          {loading && balance == null ? "…" : chips(balance ?? 0)}
          <span className="ml-1 text-sm font-semibold text-ink-muted">chips</span>
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          Start {chips(CASINO_START_CHIPS)} · Reload {chips(CASINO_RELOAD_CHIPS)}{" "}
          when empty · Min stake {CASINO_MIN_STAKE}
        </p>

        {balance === 0 && (
          <button
            type="button"
            disabled={!canReload || reloading || retryAfterMs > 0}
            onClick={() => void onReload()}
            className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-45"
          >
            {reloading
              ? "Reloading…"
              : retryAfterMs > 0
                ? `Reload in ${cooldown(retryAfterMs)}`
                : canReload
                  ? `Reload ${chips(CASINO_RELOAD_CHIPS)} chips`
                  : "Reload unavailable"}
          </button>
        )}
      </section>

      {msg && (
        <p className="mt-2 text-center text-xs font-semibold text-emerald-600">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-2 text-center text-xs font-semibold text-red-600">{err}</p>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-xl bg-ink-muted/10 p-1">
        {(
          [
            { id: "games" as const, label: "Games" },
            { id: "history" as const, label: "History" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              tab === t.id
                ? "bg-surface text-brand shadow-sm"
                : "text-ink-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "games" && (
        <>
          {/* Featured */}
          {featured && (
            <Link
              href={`/casino/${featured.id}`}
              className="mt-4 flex items-center gap-3 overflow-hidden rounded-2xl border border-brand/25 bg-gradient-to-r from-brand/15 to-brand/5 p-4 active:scale-[0.99]"
            >
              <span className="text-3xl" aria-hidden>
                {ICONS[featured.id] ?? "🎮"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand">
                  Game of the day
                </p>
                <p className="truncate text-base font-bold text-ink">
                  {featured.name}
                </p>
                <p className="truncate text-[11px] text-ink-muted">
                  {featured.blurb}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-[11px] font-bold text-white">
                Play
              </span>
            </Link>
          )}

          {/* Search */}
          <div className="mt-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games…"
              className="w-full rounded-xl border border-ink-muted/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>

          {/* Categories */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  category === c.id
                    ? "bg-brand text-white"
                    : "bg-ink-muted/10 text-ink-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {filteredGames.map((g) => (
              <Link
                key={g.id}
                href={`/casino/${g.id}`}
                className="relative overflow-hidden rounded-2xl border border-ink-muted/12 bg-surface p-4 transition active:scale-[0.98]"
              >
                {g.id === featuredId && (
                  <span className="absolute right-2 top-2 rounded bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold text-brand">
                    TODAY
                  </span>
                )}
                <span className="text-2xl" aria-hidden>
                  {ICONS[g.id] ?? "🎮"}
                </span>
                <p className="mt-2 text-sm font-bold text-ink">{g.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-muted">
                  {g.blurb}
                </p>
                <p className="mt-2 text-[10px] text-ink-muted">
                  {CASINO_MIN_STAKE}–{chips(CASINO_MAX_STAKE)} chips
                </p>
                <span className="mt-2 inline-block rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                  Play
                </span>
              </Link>
            ))}
          </div>

          {filteredGames.length === 0 && (
            <p className="mt-8 text-center text-sm text-ink-muted">
              No games match that filter.
            </p>
          )}
        </>
      )}

      {tab === "history" && (
        <div className="mt-4">
          {/* Stats */}
          <div className="mb-3 grid grid-cols-4 gap-2">
            {(
              [
                { label: "Plays", value: stats.plays },
                { label: "Wins", value: stats.wins },
                { label: "Losses", value: stats.losses },
                {
                  label: "Net",
                  value:
                    (stats.net >= 0 ? "+" : "") + chips(stats.net),
                },
              ] as const
            ).map((s) => (
              <div
                key={s.label}
                className="rounded-xl bg-ink-muted/8 px-1 py-2 text-center"
              >
                <p className="text-[9px] font-bold uppercase text-ink-muted">
                  {s.label}
                </p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
          <p className="mb-2 text-center text-[10px] text-ink-muted">
            Demo result only · Chips are not withdrawable
          </p>

          <div className="mb-3 flex gap-1 rounded-xl bg-ink-muted/10 p-1">
            {(
              [
                { id: "all" as const, label: "All" },
                { id: "wins" as const, label: "Wins" },
                { id: "losses" as const, label: "Losses" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistFilter(f.id)}
                className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold ${
                  histFilter === f.id
                    ? "bg-surface text-brand shadow-sm"
                    : "text-ink-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {histLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl bg-ink-muted/10"
                />
              ))}
            </div>
          )}

          {!histLoading && plays.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-muted">
              No plays yet — open a game and have a go.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {plays.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-ink-muted/10 bg-surface px-3 py-2.5"
              >
                <span className="text-xl" aria-hidden>
                  {ICONS[p.game] ?? "🎮"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {GAME_NAMES[p.game] ?? p.game}
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    {formatTime(p.createdAt)} · Stake {chips(p.stake)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      p.won ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {p.won ? "+" : ""}
                    {chips(p.profit)}
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    {p.won ? "Win" : "Loss"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
                                  }
          
