"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, Team, Competition, Market } from "@/types/domain";
import { deriveClockState, isBettingOpen } from "@/lib/domain/matchClock";
import { CORRECT_SCORES } from "@/lib/domain/oddsModel";
import { useBetSlip } from "@/lib/context/BetSlipContext";
import { resolveSelection } from "@/lib/domain/selectionLabel";

const CS_HOME_WIN = CORRECT_SCORES.slice(0, 10);
const CS_DRAW = CORRECT_SCORES.slice(10, 15);
const CS_AWAY_WIN = CORRECT_SCORES.slice(15, 25);

export default function MatchDetailPage({
  params,
}: {
  params: { matchId: string };
}) {
  const { matchId } = params;
  const router = useRouter();

  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [home, setHome] = useState<Team | null>(null);
  const [away, setAway] = useState<Team | null>(null);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const slip = useBetSlip();

  function isSelectionPicked(marketId: string, selectionId: string): boolean {
    return slip.items.some(
      (i) =>
        i.matchId === matchId &&
        i.marketId === marketId &&
        i.selectionId === selectionId
    );
  }

  function pickSelection(
    market: Market,
    selection: { id: string; label: string; odds: number }
  ) {
    if (!match || !home || !away) return;
    const { market: marketName, pick } = resolveSelection(
      selection.id,
      selection.label
    );
    slip.toggleItem({
      matchId: match.id,
      marketId: market.id,
      selectionId: selection.id,
      selectionLabel: pick,
      odds: selection.odds,
      homeTeamName: home.name,
      awayTeamName: away.name,
      marketName,
    });
  }

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matches", matchId), (snap) => {
      setMatch(snap.exists() ? (snap.data() as Match) : null);
    });
    return () => unsub();
  }, [matchId]);

  useEffect(() => {
    if (!match?.homeTeamId || !match?.awayTeamId || !match?.competitionId)
      return;
    const u1 = onSnapshot(doc(db, "teams", match.homeTeamId), (s) =>
      setHome(s.exists() ? (s.data() as Team) : null)
    );
    const u2 = onSnapshot(doc(db, "teams", match.awayTeamId), (s) =>
      setAway(s.exists() ? (s.data() as Team) : null)
    );
    const u3 = onSnapshot(doc(db, "competitions", match.competitionId), (s) =>
      setCompetition(s.exists() ? (s.data() as Competition) : null)
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [match]);

  useEffect(() => {
    if (!match) return;
    const unsub = onSnapshot(
      query(collection(db, "markets"), where("matchId", "==", match.id)),
      (snap) => setMarkets(snap.docs.map((d) => d.data() as Market))
    );
    return () => unsub();
  }, [match]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (match === undefined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </main>
    );
  }

  if (match === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-ink-muted">Match not found.</p>
        <button
          onClick={() => router.push("/fixtures")}
          className="text-sm font-medium text-brand underline"
        >
          Back to fixtures
        </button>
      </main>
    );
  }

  const clock = deriveClockState(match, now);
  const canBet = isBettingOpen(match);
  const isLive =
    match.status === "live" ||
    match.status === "halftime" ||
    match.status === "second_half";
  const displayScore =
    match.currentHomeScore != null && match.currentAwayScore != null
      ? match.currentHomeScore + " – " + match.currentAwayScore
      : match.homeScore != null && match.awayScore != null
        ? match.homeScore + " – " + match.awayScore
        : null;

  function marketByType(type: Market["type"]): Market | undefined {
    return markets.find((m) => m.type === type && m.status === "active");
  }

  const ouMarket = marketByType("over_under");
  const ouLines = ouMarket
    ? Array.from(
        new Set(
          ouMarket.selections
            .map((s) => /^(?:over|under)_(\d+(?:\.\d+)?)$/.exec(s.id)?.[1])
            .filter((v): v is string => Boolean(v))
        )
      )
        .map(Number)
        .sort((a, b) => a - b)
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col pb-28">
      <div className="bg-brand px-4 pb-5 pt-4 text-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-white"
            aria-label="Back"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                d="M15 18l-6-6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p className="flex-1 text-center text-xs font-medium uppercase tracking-wide text-white/70">
            {competition?.name ?? "…"}
          </p>
          <div className="w-[22px]" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <p className="flex-1 text-right text-base font-semibold leading-tight">
            {home?.name ?? "Home"}
          </p>
          <div className="shrink-0 text-center">
            {displayScore ? (
              <p className="font-display text-2xl font-bold">{displayScore}</p>
            ) : (
              <p className="text-sm font-bold">{clock.display}</p>
            )}
            {isLive && (
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-medium text-white/80">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{" "}
                Live
              </p>
            )}
          </div>
          <p className="flex-1 text-left text-base font-semibold leading-tight">
            {away?.name ?? "Away"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4">
        <MarketSection
          title="1X2"
          market={marketByType("match_winner")}
          canBet={canBet}
          isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
          onPick={(m, s) => pickSelection(m, s)}
        />

        <MarketSection
          title="Double Chance"
          market={marketByType("double_chance")}
          canBet={canBet}
          isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
          onPick={(m, s) => pickSelection(m, s)}
        />

        <MarketSection
          title="Draw No Bet"
          market={marketByType("draw_no_bet")}
          canBet={canBet}
          isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
          onPick={(m, s) => pickSelection(m, s)}
        />

        {ouMarket && ouLines.length > 0 && (
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-3 text-sm font-bold">Over/Under</p>
            <div className="flex flex-col gap-2">
              {ouLines.map((line) => {
                const over = ouMarket.selections.find(
                  (s) => s.id === "over_" + line
                );
                const under = ouMarket.selections.find(
                  (s) => s.id === "under_" + line
                );
                if (!over || !under) return null;
                return (
                  <div key={line} className="flex items-center gap-2">
                    <span className="w-12 text-xs font-medium text-ink-muted">
                      {line}
                    </span>
                    <div className="flex flex-1 gap-2">
                      {[over, under].map((s) => (
                        <SelectionButton
                          key={s.id}
                          selection={s}
                          canBet={canBet}
                          isPicked={isSelectionPicked(ouMarket.id, s.id)}
                          onPick={() => pickSelection(ouMarket, s)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <MarketSection
          title="Both Teams to Score"
          market={marketByType("both_teams_to_score")}
          canBet={canBet}
          isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
          onPick={(m, s) => pickSelection(m, s)}
        />

        {marketByType("correct_score") && (
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <p className="mb-3 text-sm font-bold">Correct Score</p>
            <div className="grid grid-cols-3 gap-3">
              <CorrectScoreColumn
                title="Home Win"
                scores={CS_HOME_WIN}
                market={marketByType("correct_score")!}
                canBet={canBet}
                isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
                onPick={(m, s) => pickSelection(m, s)}
              />
              <CorrectScoreColumn
                title="Draw"
                scores={CS_DRAW}
                market={marketByType("correct_score")!}
                canBet={canBet}
                isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
                onPick={(m, s) => pickSelection(m, s)}
              />
              <CorrectScoreColumn
                title="Away Win"
                scores={CS_AWAY_WIN}
                market={marketByType("correct_score")!}
                canBet={canBet}
                isPicked={(mid, sid) => isSelectionPicked(mid, sid)}
                onPick={(m, s) => pickSelection(m, s)}
              />
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Other
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(["other_home", "other_away", "other_draw"] as const).map(
                  (id) => {
                    const csMarket = marketByType("correct_score")!;
                    const s = csMarket.selections.find((x) => x.id === id);
                    if (!s) return null;
                    return (
                      <SelectionButton
                        key={id}
                        selection={s}
                        canBet={canBet}
                        isPicked={isSelectionPicked(csMarket.id, s.id)}
                        onPick={() => pickSelection(csMarket, s)}
                      />
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {markets.length === 0 && (
          <div className="rounded-2xl bg-surface p-4 text-center text-sm text-ink-muted shadow-card">
            Odds haven&apos;t been set for this match yet.
          </div>
        )}
      </div>
    </main>
  );
}

function MarketSection({
  title,
  market,
  canBet,
  isPicked,
  onPick,
}: {
  title: string;
  market: Market | undefined;
  canBet: boolean;
  isPicked: (marketId: string, selectionId: string) => boolean;
  onPick: (
    market: Market,
    selection: { id: string; label: string; odds: number }
  ) => void;
}) {
  if (!market || market.selections.length === 0) return null;
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card">
      <p className="mb-3 text-sm font-bold">{title}</p>
      <div className="flex gap-2">
        {market.selections.map((s) => (
          <SelectionButton
            key={s.id}
            selection={s}
            canBet={canBet}
            isPicked={isPicked(market.id, s.id)}
            onPick={() => onPick(market, s)}
          />
        ))}
      </div>
    </div>
  );
}

function CorrectScoreColumn({
  title,
  scores,
  market,
  canBet,
  isPicked,
  onPick,
}: {
  title: string;
  scores: readonly string[];
  market: Market;
  canBet: boolean;
  isPicked: (marketId: string, selectionId: string) => boolean;
  onPick: (
    market: Market,
    selection: { id: string; label: string; odds: number }
  ) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      <div className="flex flex-col gap-1.5">
        {scores.map((id) => {
          const s = market.selections.find((x) => x.id === id);
          if (!s) return null;
          const picked = isPicked(market.id, s.id);
          return (
            <button
              key={id}
              type="button"
              disabled={!canBet}
              onClick={() => onPick(market, s)}
              className={
                "flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors " +
                (!canBet
                  ? "bg-ink-muted/10 text-ink-muted"
                  : picked
                    ? "bg-brand text-white"
                    : "bg-brand/10 text-brand active:bg-brand/20")
              }
            >
              <span className={picked ? "text-white/80" : "text-ink-muted"}>
                {id.replace("-", ":")}
              </span>
              <span className="font-display font-bold tabular-nums">
                {s.odds.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SelectionButton({
  selection,
  canBet,
  isPicked,
  onPick,
}: {
  selection: { id: string; label: string; odds: number };
  canBet: boolean;
  isPicked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!canBet}
      onClick={onPick}
      className={
        "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2.5 transition-colors " +
        (!canBet
          ? "bg-ink-muted/10 text-ink-muted"
          : isPicked
            ? "bg-brand text-white"
            : "bg-brand/10 text-brand active:bg-brand/20")
      }
    >
      <span
        className={
          "text-[11px] font-medium " +
          (isPicked ? "text-white/80" : "text-ink-muted")
        }
      >
        {selection.label}
      </span>
      <span className="flex items-center gap-1 font-display text-base font-bold tabular-nums">
        {!canBet && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="opacity-70"
          >
            <path d="M17 9V7a5 5 0 00-10 0v2a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-8-2a3 3 0 016 0v2H9V7z" />
          </svg>
        )}
        {selection.odds.toFixed(2)}
      </span>
    </button>
  );
                        }
