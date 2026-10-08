"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Competition, Market, Match, Team } from "@/types/domain";
import { groupFixturesForBrowsing } from "@/lib/domain/fixtureDisplay";
import { isBettingOpen } from "@/lib/domain/matchClock";
import { resolveSelection } from "@/lib/domain/selectionLabel";
import { useBetSlip } from "@/lib/context/BetSlipContext";
import { MatchCard, type MatchCardSelection } from "@/components/sportsbook/MatchCard";
import { SectionHeader } from "@/components/sportsbook/SectionHeader";

type FixturesPayload = {
  matches: Match[];
  teams: Team[];
  competitions: Competition[];
  markets?: Market[];
};

function isLiveStatus(s: Match["status"]) {
  return s === "live" || s === "halftime" || s === "second_half";
}

export default function HomePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [competitions, setCompetitions] = useState<Record<string, Competition>>({});
  const [marketsByMatch, setMarketsByMatch] = useState<
    Record<string, Market | undefined>
  >({});
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const slip = useBetSlip();

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    try {
      const res = await fetch("/api/public/fixtures", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load fixtures");
      const data = (await res.json()) as FixturesPayload;

      setMatches(
        (data.matches ?? []).filter(
          (m) => m?.id && m?.homeTeamId && m?.awayTeamId && m?.kickoffAt
        )
      );

      const teamMap: Record<string, Team> = {};
      (data.teams ?? []).forEach((t) => {
        if (t?.id) teamMap[t.id] = t;
      });
      setTeams(teamMap);

      const compMap: Record<string, Competition> = {};
      (data.competitions ?? []).forEach((c) => {
        if (c?.id) compMap[c.id] = c;
      });
      setCompetitions(compMap);

      const mw: Record<string, Market | undefined> = {};
      (data.markets ?? []).forEach((mkt) => {
        if (
          mkt?.matchId &&
          mkt.type === "match_winner" &&
          (mkt.status === "active" || mkt.status === "locked")
        ) {
          // Prefer active over locked if both appear
          if (!mw[mkt.matchId] || mkt.status === "active") {
            mw[mkt.matchId] = mkt;
          }
        }
      });
      setMarketsByMatch(mw);
      setError(null);
    } catch {
      setError("Fixtures unavailable. Pull to refresh or try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 120_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { live, upcoming } = useMemo(
    () => groupFixturesForBrowsing(matches, now),
    [matches, now]
  );

  /** Popular: soonest open/scheduled with a match_winner market */
  const popular = useMemo(() => {
    return matches
      .filter(
        (m) =>
          !isLiveStatus(m.status) &&
          m.status !== "finished" &&
          m.status !== "result_confirmed" &&
          m.status !== "settled" &&
          m.status !== "voided" &&
          m.status !== "postponed" &&
          marketsByMatch[m.id] &&
          isBettingOpen(m, now)
      )
      .sort((a, b) => a.kickoffAt - b.kickoffAt)
      .slice(0, 6);
  }, [matches, marketsByMatch, now]);

  const featured = useMemo(() => {
    if (live[0]) return live[0];
    if (popular[0]) return popular[0];
    return upcoming[0]?.matches[0] ?? null;
  }, [live, popular, upcoming]);

  const upcomingSections = useMemo(() => {
    // Cap total cards on home so it stays scannable
    let remaining = 8;
    const out: { key: string; label: string; matches: Match[] }[] = [];
    for (const sec of upcoming) {
      if (remaining <= 0) break;
      const slice = sec.matches.slice(0, remaining);
      if (slice.length === 0) continue;
      out.push({ key: sec.key, label: sec.label, matches: slice });
      remaining -= slice.length;
    }
    return out;
  }, [upcoming]);

  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    (slip.items ?? []).forEach((it) => {
      set.add(`${it.matchId}:${it.selectionId}`);
    });
    return set;
  }, [slip.items]);

  function teamName(id: string, fallback: string) {
    return teams[id]?.name ?? fallback;
  }

  function compName(id: string) {
    return competitions[id]?.name ?? "";
  }

  function oddsFor(match: Match): MatchCardSelection[] | undefined {
    const mkt = marketsByMatch[match.id];
    if (!mkt?.selections?.length) return undefined;
    return mkt.selections.map((s) => ({ ...s, marketId: mkt.id }));
  }

  function canBetMatch(match: Match) {
    const mkt = marketsByMatch[match.id];
    return (
      isBettingOpen(match, now) &&
      Boolean(mkt) &&
      mkt!.status === "active" &&
      (mkt!.selections?.length ?? 0) > 0
    );
  }

  function toggleSel(match: Match, sel: MatchCardSelection) {
    const mkt = marketsByMatch[match.id];
    if (!mkt) return;
    const home = teamName(match.homeTeamId, "Home");
    const away = teamName(match.awayTeamId, "Away");
    const { market: marketName, pick } = resolveSelection(sel.id, sel.label);
    slip.toggleItem({
      matchId: match.id,
      marketId: mkt.id,
      selectionId: sel.id,
      selectionLabel: pick,
      odds: sel.odds,
      homeTeamName: home,
      awayTeamName: away,
      marketName,
    });
  }

  function renderCard(match: Match, compact = false) {
    return (
      <MatchCard
        key={match.id}
        match={match}
        homeName={teamName(match.homeTeamId, "Home")}
        awayName={teamName(match.awayTeamId, "Away")}
        competitionName={compName(match.competitionId)}
        odds1x2={oddsFor(match)}
        selectedIds={selectedIds}
        canBet={canBetMatch(match)}
        onToggleSelection={(sel) => toggleSel(match, sel)}
        compact={compact}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 pb-28 pt-4">
      {/* Quick actions */}
      <div className="flex gap-2">
        <Link
          href="/fixtures?filter=live"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-600"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          Live
        </Link>
        <Link
          href="/fixtures"
          className="flex flex-1 items-center justify-center rounded-xl bg-brand/10 px-3 py-2.5 text-xs font-bold text-brand"
        >
          All sports
        </Link>
        <Link
          href="/virtual"
          className="flex flex-1 items-center justify-center rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"
        >
          Virtual
        </Link>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-ink-muted/10"
            />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="mt-2 text-xs font-bold underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <p className="py-12 text-center text-sm text-ink-muted">
          No fixtures right now — check back soon.
        </p>
      )}

      {/* Featured */}
      {!loading && featured && (
        <section>
          <SectionHeader title="Featured" href={`/fixtures/${featured.id}`} hrefLabel="Open" />
          {renderCard(featured)}
        </section>
      )}

      {/* Live */}
      {!loading && live.length > 0 && (
        <section>
          <SectionHeader
            title={`Live (${live.length})`}
            href="/fixtures"
            hrefLabel="See all"
            accent="live"
          />
          <div className="flex flex-col gap-2.5">
            {live.slice(0, 5).map((m) => renderCard(m))}
          </div>
        </section>
      )}

      {/* Popular */}
      {!loading && popular.length > 0 && (
        <section>
          <SectionHeader title="Popular" href="/fixtures" hrefLabel="See all" />
          <div className="flex flex-col gap-2.5">
            {popular
              .filter((m) => m.id !== featured?.id)
              .slice(0, 5)
              .map((m) => renderCard(m))}
          </div>
        </section>
      )}

      {/* Upcoming by day */}
      {!loading &&
        upcomingSections.map((sec) => (
          <section key={sec.key}>
            <SectionHeader
              title={sec.label}
              href="/fixtures"
              hrefLabel="See all"
            />
            <div className="flex flex-col gap-2.5">
              {sec.matches
                .filter(
                  (m) =>
                    m.id !== featured?.id &&
                    !popular.some((p) => p.id === m.id && sec.label === "Today")
                )
                .map((m) => renderCard(m, true))}
            </div>
          </section>
        ))}

      {!loading && matches.length > 0 && (
        <Link
          href="/fixtures"
          className="rounded-2xl bg-brand py-3.5 text-center text-sm font-bold text-white shadow-card"
        >
          Browse all fixtures
        </Link>
      )}
    </main>
  );
      }

              
