"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition, Market } from "@/types/domain";
import { isBettingOpen } from "@/lib/domain/matchClock";
import { groupFixturesForBrowsing } from "@/lib/domain/fixtureDisplay";
import { OU_LINES } from "@/lib/domain/oddsModel";
import { LiveClockBadge } from "@/components/LiveClock";
import { useBetSlip } from "@/lib/context/BetSlipContext";
import { resolveSelection } from "@/lib/domain/selectionLabel";

type FilterTab = "all" | "today" | "live" | "hot";
type MarketTab = "match_winner" | "over_under" | "double_chance";
type SortBy = "time" | "odds" | "league";

const MARKET_TABS: { key: MarketTab; label: string }[] = [
  { key: "match_winner", label: "1X2" },
  { key: "over_under", label: "O/U" },
  { key: "double_chance", label: "DC" },
];

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db_ = new Date(b);
  return (
    da.getFullYear() === db_.getFullYear() &&
    da.getMonth() === db_.getMonth() &&
    da.getDate() === db_.getDate()
  );
}

export default function FixturesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});
  const [marketsByMatch, setMarketsByMatch] = useState<
    Record<string, Partial<Record<Market["type"], Market>>>
  >({});
  const [activeFilter, setActiveFilter] = useState<FilterTab>("today");
  const [marketTab, setMarketTab] = useState<MarketTab>("match_winner");
  const [ouLine, setOuLine] = useState<number>(2.5);
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [leagueId, setLeagueId] = useState<string>("all");
  const slip = useBetSlip();

  useEffect(() => {
    const unsubMatches = onSnapshot(
      query(collection(db, "matches"), orderBy("kickoffAt")),
      (snap) => {
        const valid = snap.docs
          .map((d) => d.data() as Match)
          .filter((m) => m && m.id && m.homeTeamId && m.awayTeamId && m.kickoffAt);
        setMatches(valid);
      }
    );

    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const map: Record<string, Team> = {};
      snap.docs.forEach((d) => {
        const team = d.data() as Team;
        if (team?.id) map[team.id] = team;
      });
      setTeams(map);
    });

    const unsubCompetitions = onSnapshot(collection(db, "competitions"), (snap) => {
      const map: Record<string, Competition> = {};
      snap.docs.forEach((d) => {
        const c = d.data() as Competition;
        if (c?.id) map[c.id] = c;
      });
      setCompetitions(map);
    });

    const unsubMarkets = onSnapshot(collection(db, "markets"), (snap) => {
      const map: Record<string, Partial<Record<Market["type"], Market>>> = {};
      snap.docs.forEach((d) => {
        const market = d.data() as Market;
        if (!market?.matchId) return;
        if (!map[market.matchId]) map[market.matchId] = {};
        map[market.matchId]![market.type] = market;
      });
      setMarketsByMatch(map);
    });

    return () => {
      unsubMatches();
      unsubTeams();
      unsubCompetitions();
      unsubMarkets();
    };
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const leagueOptions = useMemo(() => {
    const ids = new Set(matches.map((m) => m.competitionId).filter(Boolean));
    return Array.from(ids)
      .map((id) => ({ id, name: competitions[id]?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matches, competitions]);

  function primaryOdds(matchId: string): number {
    const forMatch = marketsByMatch[matchId];
    if (!forMatch) return 999;
    if (marketTab === "match_winner")
      return forMatch.match_winner?.selections[0]?.odds ?? 999;
    if (marketTab === "double_chance")
      return forMatch.double_chance?.selections[0]?.odds ?? 999;
    const ou = forMatch.over_under;
    return ou?.selections.find((s) => s.id === "over_" + ouLine)?.odds ?? 999;
  }

  const { live, upcoming, recentResults } = useMemo(() => {
    let filtered = matches;

    if (leagueId !== "all") {
      filtered = filtered.filter((m) => m.competitionId === leagueId);
    }

    if (activeFilter === "today") {
      filtered = filtered.filter((m) => isSameDay(m.kickoffAt, now));
    } else if (activeFilter === "live") {
      filtered = filtered.filter((m) =>
        ["live", "halftime", "second_half"].includes(m.status)
      );
    } else if (activeFilter === "hot") {
      filtered = filtered
        .filter((m) => marketsByMatch[m.id]?.match_winner)
        .sort((a, b) => primaryOdds(a.id) - primaryOdds(b.id))
        .slice(0, 12);
    }

    const sorted = [...filtered];
    if (sortBy === "odds") {
      sorted.sort((a, b) => primaryOdds(a.id) - primaryOdds(b.id));
    } else if (sortBy === "league") {
      sorted.sort((a, b) => {
        const nameA = competitions[a.competitionId]?.name ?? "";
        const nameB = competitions[b.competitionId]?.name ?? "";
        return nameA.localeCompare(nameB) || a.kickoffAt - b.kickoffAt;
      });
    }

    return groupFixturesForBrowsing(sorted, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matches,
    now,
    activeFilter,
    sortBy,
    marketTab,
    ouLine,
    marketsByMatch,
    competitions,
    leagueId,
  ]);

  const isEmpty = live.length === 0 && upcoming.length === 0;

  function addSelection(
    match: Match,
    market: Market,
    selection: { id: string; label: string; odds: number }
  ) {
    const home = teams[match.homeTeamId];
    const away = teams[match.awayTeamId];
    const { market: marketName, pick } = resolveSelection(
      selection.id,
      selection.label
    );
    slip.addItem({
      matchId: match.id,
      marketId: market.id,
      selectionId: selection.id,
      selectionLabel: pick,
      odds: selection.odds,
      homeTeamName: home?.name ?? "Home",
      awayTeamName: away?.name ?? "Away",
      marketName,
    });
  }

  function MatchCard({ match }: { match: Match }) {
    const home = match.homeTeamId ? teams[match.homeTeamId] : undefined;
    const away = match.awayTeamId ? teams[match.awayTeamId] : undefined;
    const marketsForMatch = marketsByMatch[match.id];
    const activeMarket =
      marketTab === "match_winner"
        ? marketsForMatch?.match_winner
        : marketTab === "double_chance"
          ? marketsForMatch?.double_chance
          : marketsForMatch?.over_under;

    const visibleSelections =
      marketTab === "over_under"
        ? (activeMarket?.selections.filter(
            (s) => s.id === "over_" + ouLine || s.id === "under_" + ouLine
          ) ?? [])
        : (activeMarket?.selections ?? []);

    const canBet =
      isBettingOpen(match) && Boolean(activeMarket) && visibleSelections.length > 0;
    const isLive =
      match.status === "live" ||
      match.status === "halftime" ||
      match.status === "second_half";
    const isHot =
      (marketsForMatch?.match_winner?.selections[0]?.odds ?? 999) < 1.5;

    const hasLiveScore =
      match.currentHomeScore != null && match.currentAwayScore != null;
    const hasFinalScore =
      match.status === "settled" &&
      match.homeScore != null &&
      match.awayScore != null;
    const scoreHome = hasFinalScore ? match.homeScore : match.currentHomeScore;
    const scoreAway = hasFinalScore ? match.awayScore : match.currentAwayScore;
    const showScore = hasLiveScore || hasFinalScore;

    const inSlip = slip.items.some((i) => i.matchId === match.id);

    return (
      <div
        className={
          "rounded-2xl bg-surface p-3.5 shadow-card " +
          (isLive ? "ring-1 ring-loss/25 " : "") +
          (inSlip ? "ring-1 ring-brand/40 " : "")
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {isHot && (
              <span className="shrink-0 rounded bg-loss px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                HOT
              </span>
            )}
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {match.competitionId
                ? competitions[match.competitionId]?.name ?? "…"
                : "…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10px] text-ink-muted">
              ID {match.id.slice(0, 6).toUpperCase()}
            </span>
            <LiveClockBadge match={match} />
          </div>
        </div>

        {/* Teams + odds */}
        <div className="mt-2 flex items-center gap-2">
          <Link href={"/fixtures/" + match.id} className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug">
              {home?.name ?? "Unknown team"}
            </p>
            <p className="truncate text-[15px] font-semibold leading-snug">
              {away?.name ?? "Unknown team"}
            </p>
          </Link>

          {showScore ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={
                  "rounded-lg px-3 py-1.5 font-display text-base font-bold tabular-nums " +
                  (hasLiveScore && !hasFinalScore
                    ? "bg-loss/10 text-loss"
                    : "bg-surface-raised text-ink")
                }
              >
                {scoreHome} – {scoreAway}
                {hasLiveScore && !hasFinalScore && (
                  <span className="ml-1 text-[10px] font-semibold uppercase">
                    Live
                  </span>
                )}
              </span>
              {visibleSelections.length > 0 && !canBet && (
                <div className="flex gap-1">
                  {visibleSelections.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-0.5 text-[10px] text-ink-muted"
                    >
                      <LockIcon />
                      {s.odds.toFixed(2)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : visibleSelections.length > 0 ? (
            <div className="flex shrink-0 gap-1">
              {visibleSelections.map((selection) => {
                const selected =
                  slip.items.some(
                    (i) =>
                      i.matchId === match.id &&
                      i.selectionId === selection.id
                  );
                return (
                  <button
                    key={selection.id}
                    type="button"
                    disabled={!canBet}
                    onClick={() =>
                      activeMarket &&
                      canBet &&
                      addSelection(match, activeMarket, selection)
                    }
                    className={
                      "flex min-w-[3.4rem] flex-col items-center rounded-lg px-1.5 py-1.5 transition-colors " +
                      (!canBet
                        ? "bg-ink-muted/10 text-ink-muted"
                        : selected
                          ? "bg-brand text-white"
                          : "bg-emerald-50 text-emerald-800 active:bg-emerald-100")
                    }
                  >
                    <span
                      className={
                        "text-[9px] font-medium " +
                        (selected ? "text-white/80" : "text-ink-muted")
                      }
                    >
                      {shortLabel(selection.label, selection.id, marketTab)}
                    </span>
                    <span className="flex items-center gap-0.5 font-display text-sm font-bold tabular-nums">
                      {!canBet && <LockIcon />}
                      {selection.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="shrink-0 text-xs text-ink-muted">Odds soon</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 overflow-x-hidden px-3 pb-28 pt-4">
      {/* Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-card"
        >
          <BackIcon />
        </Link>
        <h1 className="flex-1 font-display text-xl font-bold">Football</h1>
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-card"
        >
          <HomeIcon />
        </Link>
      </div>

      {/* Day / live filters */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
        {(
          [
            { key: "all" as FilterTab, label: "All" },
            { key: "today" as FilterTab, label: "Today" },
            { key: "live" as FilterTab, label: "Live" },
            { key: "hot" as FilterTab, label: "Hot" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilter(tab.key)}
            className={
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors " +
              (activeFilter === tab.key
                ? "bg-brand text-white"
                : "bg-surface text-ink-muted shadow-card")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* League filter */}
      {leagueOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-xs text-ink-muted">League</label>
          <select
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-ink-muted/20 bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All leagues ({matches.length})</option>
            {leagueOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Market tabs 1X2 / O/U / DC */}
      <div className="flex items-center gap-1 rounded-xl bg-surface p-1 shadow-card">
        {MARKET_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMarketTab(tab.key)}
            className={
              "flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-colors " +
              (marketTab === tab.key
                ? "bg-brand text-white"
                : "text-ink-muted")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* O/U line picker */}
      {marketTab === "over_under" && (
        <div className="flex flex-wrap gap-1.5">
          {OU_LINES.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => setOuLine(line)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold " +
                (ouLine === line
                  ? "bg-brand text-white"
                  : "bg-surface text-ink-muted shadow-card")
              }
            >
              {line}
            </button>
          ))}
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-muted">Sort:</span>
        {(
          [
            { key: "time" as SortBy, label: "Time" },
            { key: "odds" as SortBy, label: "Odds" },
            { key: "league" as SortBy, label: "League" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSortBy(opt.key)}
            className={
              "rounded-full px-3 py-1 font-medium " +
              (sortBy === opt.key
                ? "bg-brand/10 text-brand"
                : "text-ink-muted")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isEmpty && (
        <p className="py-10 text-center text-sm text-ink-muted">
          No fixtures right now — check back soon.
        </p>
      )}

      {live.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-loss">
              Live now
            </h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {live.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {upcoming.map((section) => (
        <section key={section.key} className="flex flex-col gap-2">
          <h2 className="px-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {section.label}
          </h2>
          <div className="flex flex-col gap-2.5">
            {section.matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}

      {recentResults.length > 0 && activeFilter === "all" && (
        <section className="flex flex-col gap-2">
          <h2 className="px-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Recent results
          </h2>
          <div className="flex flex-col gap-2.5">
            {recentResults.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function shortLabel(
  label: string,
  id: string,
  tab: MarketTab
): string {
  if (tab === "match_winner") {
    if (id === "home") return "1";
    if (id === "draw") return "X";
    if (id === "away") return "2";
  }
  if (tab === "double_chance") {
    if (id === "home_draw") return "1X";
    if (id === "home_away") return "12";
    if (id === "draw_away") return "X2";
  }
  if (tab === "over_under") {
    if (id.startsWith("over")) return "O";
    if (id.startsWith("under")) return "U";
  }
  return label.length > 4 ? label.slice(0, 4) : label;
}

function LockIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="opacity-70"
    >
      <path d="M17 9V7a5 5 0 00-10 0v2a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-8-2a3 3 0 016 0v2H9V7z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
                  }
