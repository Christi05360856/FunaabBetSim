"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Bet, BetLeg, Match, Team } from "@/types/domain";
import {
  formatMoney,
  formatMoneyFull,
  matchFinalScore,
  resolveSelection,
} from "@/lib/domain/selectionLabel";

function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel || "",
      odds:
        bet.oddsAtPlacement ||
        (bet.stake > 0 ? bet.potentialPayout / bet.stake : 1),
    },
  ];
}

function totalOdds(bet: Bet): number {
  const legs = betLegs(bet);
  if (legs.length === 0) return 1;
  return legs.reduce((acc, l) => acc * (l.odds || 1), 1);
}

function publicTicketCode(bet: Bet): string {
  const anyBet = bet as Bet & { ticketCode?: string };
  return (anyBet.ticketCode || bet.id).toUpperCase();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function statusStyle(status: string): string {
  if (status === "won") return "bg-emerald-100 text-emerald-800";
  if (status === "lost") return "bg-rose-100 text-rose-800";
  if (status === "void") return "bg-gray-100 text-gray-600";
  return "bg-amber-100 text-amber-800";
}

/**
 * Per-leg result:
 * 1) Prefer leg.status written by settle
 * 2) Else for 1X2, resolve from FT score on the match doc
 *    (so Away on 0-2 shows Won even if ticket is Lost)
 */
function legResult(
  leg: { selectionId: string; status?: string },
  match: Match | undefined
): "won" | "lost" | "void" | "pending" {
  // Final stored results win — but "pending" is re-checked against FT score
  // because settle may lock the ticket LOST on the first failed leg while
  // other legs were still pending, and later settles no longer touch them.
  if (leg.status === "won" || leg.status === "lost" || leg.status === "void") {
    return leg.status;
  }

  const hs =
    match?.homeScore != null
      ? match.homeScore
      : match?.currentHomeScore != null
        ? match.currentHomeScore
        : null;
  const as =
    match?.awayScore != null
      ? match.awayScore
      : match?.currentAwayScore != null
        ? match.currentAwayScore
        : null;

  const scoreIsFinal =
    match != null &&
    hs != null &&
    as != null &&
    (match.status === "settled" ||
      match.status === "finished" ||
      match.status === "result_confirmed" ||
      (match.homeScore != null && match.awayScore != null));

  if (scoreIsFinal && hs != null && as != null) {
    const id = (leg.selectionId || "").toLowerCase();
    if (
      id === "home" ||
      id === "draw" ||
      id === "away" ||
      id === "1" ||
      id === "x" ||
      id === "2"
    ) {
      const winner = hs > as ? "home" : as > hs ? "away" : "draw";
      const normalized =
        id === "1" ? "home" : id === "2" ? "away" : id === "x" ? "draw" : id;
      return normalized === winner ? "won" : "lost";
    }
  }

  return "pending";
}
export default function MyBetsPage() {
  const { user, loading } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [activeTab, setActiveTab] = useState<"open" | "settled">("open");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detailBet, setDetailBet] = useState<Bet | null>(null);
  const [sharingBet, setSharingBet] = useState<Bet | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubBets = onSnapshot(
      query(collection(db, "bets"), where("uid", "==", user.uid)),
      (snap) => {
        setBets(
          snap.docs
            .map((d) => d.data() as Bet)
            .sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0))
        );
      }
    );

    const unsubMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const map: Record<string, Match> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as Match;
      });
      setMatches(map);
    });

    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      const map: Record<string, Team> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as Team;
      });
      setTeams(map);
    });

    return () => {
      unsubBets();
      unsubMatches();
      unsubTeams();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-gray-600">Sign in to see your bets.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const visible = bets.filter((b) => !b.hidden);
  const openBets = visible.filter((b) => b.status === "open");
  const settledBets = visible.filter((b) => b.status !== "open");
  const list = activeTab === "open" ? openBets : settledBets;

  async function hideBet(betId: string) {
    setMenuId(null);
    try {
      const token = await user!.getIdToken();
      await fetch("/api/bets/hide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ betId }),
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-gray-50 pb-24">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">My Bets</h1>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("open")}
            className={
              "flex-1 rounded-full py-2 text-sm font-semibold " +
              (activeTab === "open"
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600")
            }
          >
            Open ({openBets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settled")}
            className={
              "flex-1 rounded-full py-2 text-sm font-semibold " +
              (activeTab === "settled"
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600")
            }
          >
            Settled ({settledBets.length})
          </button>
        </div>
      </header>

      <div className="space-y-3 px-3 py-3">
        {list.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-500">
            {activeTab === "open" ? "No open bets." : "No settled bets."}
          </p>
        )}

        {list.map((bet) => {
          const legs = betLegs(bet);
          const first = legs[0];
          const match = first ? matches[first.matchId] : undefined;
          const home = match
            ? teams[match.homeTeamId]?.name ?? "Home"
            : "Home";
          const away = match
            ? teams[match.awayTeamId]?.name ?? "Away"
            : "Away";
          const odds = totalOdds(bet);
          const isAcca = legs.length > 1;
          const { market, pick } = resolveSelection(
            first?.selectionId ?? bet.selectionId,
            first?.selectionLabel ?? bet.selectionLabel
          );

          return (
            <article
              key={bet.id}
              className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setDetailBet(bet)}
                >
                  <p className="truncate font-mono text-[10px] text-gray-400">
                    ID: {bet.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-900">
                    {isAcca
                      ? "Accumulator · " + legs.length + " legs"
                      : home + " vs " + away}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {isAcca
                      ? legs.length + " selections"
                      : market + " · " + pick}
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={
                      "rounded px-2 py-0.5 text-[10px] font-bold uppercase " +
                      statusStyle(bet.status)
                    }
                  >
                    {bet.status}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-gray-400"
                    onClick={() =>
                      setMenuId(menuId === bet.id ? null : bet.id)
                    }
                    aria-label="Menu"
                  >
                    ⋮
                  </button>
                </div>
              </div>

              {menuId === bet.id && (
                <div className="absolute right-3 top-12 z-10 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setMenuId(null);
                      setSharingBet(bet);
                    }}
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => setDetailBet(bet)}
                  >
                    Details
                  </button>
                  {bet.status !== "open" && (
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-gray-50"
                      onClick={() => void hideBet(bet.id)}
                    >
                      Hide
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                className="mt-3 grid w-full grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-left text-xs"
                onClick={() => setDetailBet(bet)}
              >
                <div>
                  <p className="text-gray-400">Odds</p>
                  <p className="font-semibold tabular-nums">{odds.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Stake</p>
                  <p
                    className="font-semibold tabular-nums"
                    title={formatMoneyFull(bet.stake)}
                  >
                    {formatMoney(bet.stake)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">
                    {bet.status === "won" ? "Return" : "Pot. win"}
                  </p>
                  <p
                    className={
                      "font-semibold tabular-nums " +
                      (bet.status === "won" ? "text-emerald-600" : "")
                    }
                    title={formatMoneyFull(bet.potentialPayout)}
                  >
                    {formatMoney(bet.potentialPayout)}
                  </p>
                </div>
              </button>
            </article>
          );
        })}
      </div>

      {detailBet && (
        <TicketDetails
          bet={detailBet}
          matches={matches}
          teams={teams}
          onClose={() => setDetailBet(null)}
        />
      )}
      {sharingBet && (
        <ShareSheet
          bet={sharingBet}
          matches={matches}
          teams={teams}
          onClose={() => setSharingBet(null)}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  full,
  strong,
  green,
}: {
  label: string;
  value: string;
  full?: string;
  strong?: boolean;
  green?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span
        className={
          "min-w-0 truncate text-right tabular-nums " +
          (strong ? "font-bold " : "font-semibold ") +
          (green ? "text-emerald-600" : "")
        }
        title={full || value}
      >
        {value}
      </span>
    </div>
  );
}

function TicketDetails({
  bet,
  matches,
  teams,
  onClose,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
  onClose: () => void;
}) {
  const legs = betLegs(bet);
  const odds = totalOdds(bet);
  const isAcca = legs.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-x-hidden bg-gray-50">
      <header className="flex shrink-0 items-center gap-3 bg-emerald-600 px-3 py-3 text-white">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-xl leading-none"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="flex-1 text-base font-bold">Ticket Details</h2>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[11px] text-gray-400">
            <span className="min-w-0 truncate font-mono">
              ID: {bet.id.slice(0, 10).toUpperCase()}
            </span>
            <span className="shrink-0">
              {new Date(bet.placedAt).toLocaleString("en-NG", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm font-bold">
              {isAcca ? "Multiple" : "Single"}
            </p>
            <span
              className={
                "rounded px-2 py-0.5 text-[10px] font-bold uppercase " +
                statusStyle(bet.status)
              }
            >
              {bet.status === "won" ? "Won" : bet.status}
            </span>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            <Row
              label={bet.status === "won" ? "Total return" : "Potential return"}
              value={formatMoney(bet.potentialPayout)}
              full={formatMoneyFull(bet.potentialPayout)}
              strong
              green
            />
            <Row
              label="Total stake"
              value={formatMoney(bet.stake)}
              full={formatMoneyFull(bet.stake)}
            />
            <Row label="Total odds" value={odds.toFixed(2)} />
          </div>
        </section>

        <div className="mt-3 flex flex-col gap-3">
          {legs.map((leg, i) => {
            const match = matches[leg.matchId];
            const home = match
              ? teams[match.homeTeamId]?.name ?? "Home"
              : "Home";
            const away = match
              ? teams[match.awayTeamId]?.name ?? "Away"
              : "Away";
            const score = matchFinalScore(match);
            const { market, pick } = resolveSelection(
              leg.selectionId,
              leg.selectionLabel
            );
            const lr = legResult(leg, match);
            const won = lr === "won";
            const lost = lr === "lost";
            const outcome =
              lr === "won"
                ? pick
                : lr === "lost"
                  ? "Lost"
                  : lr === "void"
                    ? "Void"
                    : "Pending";

            const canOpenMatch =
              Boolean(leg.matchId) &&
              (bet.status === "open" ||
                (match &&
                  match.status !== "settled" &&
                  match.status !== "voided"));

            return (
              <section
                key={leg.matchId + "-" + leg.selectionId + "-" + i}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                {canOpenMatch ? (
                  <Link
                    href={"/fixtures/" + leg.matchId}
                    onClick={onClose}
                    className="block active:opacity-80"
                  >
                    <p className="text-[11px] text-gray-400">
                      {match
                        ? new Date(match.kickoffAt).toLocaleString("en-NG", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-snug">
                      {home} vs {away}
                      <span className="ml-1 text-[11px] font-normal text-emerald-600">
                        View markets →
                      </span>
                    </p>
                  </Link>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-400">
                      {match
                        ? new Date(match.kickoffAt).toLocaleString("en-NG", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-snug">
                      {home} vs {away}
                    </p>
                  </>
                )}
                {score && (
                  <p className="mt-1 text-xs font-medium text-gray-600">
                    {score.live ? "Live score " : "FT score "}
                    <span className={score.live ? "text-rose-600" : ""}>
                      {score.text}
                    </span>
                  </p>
                )}

                <div
                  className={
                    "mt-3 rounded-xl px-3 py-3 text-sm " +
                    (won
                      ? "bg-emerald-50"
                      : lost
                        ? "bg-rose-50"
                        : "bg-gray-50")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p>
                        <span className="text-gray-500">Market </span>
                        <span className="font-medium">{market}</span>
                      </p>
                      <p>
                        <span className="text-gray-500">Pick </span>
                        <span className="font-medium">
                          {pick} @{Number(leg.odds).toFixed(2)}
                        </span>
                        {won && (
                          <span className="ml-1 text-emerald-600">✓</span>
                        )}
                        {lost && (
                          <span className="ml-1 text-rose-600">✗</span>
                        )}
                      </p>
                      <p>
                        <span className="text-gray-500">Outcome </span>
                        <span
                          className={
                            "font-semibold " +
                            (won
                              ? "text-emerald-700"
                              : lost
                                ? "text-rose-700"
                                : "")
                          }
                        >
                          {outcome}
                        </span>
                      </p>
                    </div>
                    {won && <span className="shrink-0 text-xl">🏆</span>}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {bet.status === "won" && (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Paid out
            </p>
            <p
              className="mt-1 break-all text-xl font-bold tabular-nums text-emerald-700"
              title={formatMoneyFull(bet.potentialPayout)}
            >
              +{formatMoney(bet.potentialPayout)}
            </p>
            <p className="mt-1 break-all text-[10px] text-gray-400">
              {formatMoneyFull(bet.potentialPayout)}
            </p>
          </div>
        )}
        {bet.status === "lost" && (
          <div className="mt-4 rounded-2xl bg-rose-50 py-3 text-center text-sm font-semibold text-rose-700">
            Lost
          </div>
        )}
      </div>
    </div>
  );
}

function ShareSheet({
  bet,
  matches,
  teams,
  onClose,
}: {
  bet: Bet;
  matches: Record<string, Match>;
  teams: Record<string, Team>;
  onClose: () => void;
}) {
  const legs = betLegs(bet);
  const first = legs[0];
  const match = first ? matches[first.matchId] : undefined;
  const home = match ? teams[match.homeTeamId]?.name ?? "Home" : "Home";
  const away = match ? teams[match.awayTeamId]?.name ?? "Away" : "Away";
  const odds = totalOdds(bet);
  const isOpenBet = bet.status === "open";
  const [bookingCode, setBookingCode] = useState<string | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingErr, setBookingErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resolvedCode, setResolvedCode] = useState(() => publicTicketCode(bet));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getAuth } = await import("firebase/auth");
        const u = getAuth().currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const res = await fetch("/api/bets/ensure-ticket-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ betId: bet.id }),
        });
        const body = await res.json();
        if (!cancelled && body.ticketCode) {
          setResolvedCode(String(body.ticketCode).toUpperCase());
        }
      } catch { /* keep local */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [bet.id]);

  async function generateBookingCode() {
    if (!isOpenBet || legs.length === 0) return;
    setBookingBusy(true);
    setBookingErr(null);
    try {
      const payload = legs.map((leg) => {
        const m = matches[leg.matchId];
        const h = m ? teams[m.homeTeamId]?.name ?? "Home" : "Home";
        const a = m ? teams[m.awayTeamId]?.name ?? "Away" : "Away";
        const sel = resolveSelection(leg.selectionId, leg.selectionLabel);
        return {
          matchId: leg.matchId,
          marketId: leg.marketId,
          selectionId: leg.selectionId,
          selectionLabel: leg.selectionLabel || sel.pick,
          odds: leg.odds,
          homeTeamName: h,
          awayTeamName: a,
          marketName: sel.market,
        };
      });
      const res = await fetch("/api/bets/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs: payload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not book");
      setBookingCode(body.code as string);
    } catch (e) {
      setBookingErr(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBookingBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#0b1c36] text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-emerald-600 to-blue-900 px-4 py-4 text-center">
          <p className="text-sm font-bold tracking-wide">FUNAAB BETSIM</p>
          <p className="mt-1 font-mono text-[10px] text-white/80">
            ID {bet.id.slice(0, 12).toUpperCase()}
          </p>
          <p className="text-[10px] text-white/70">
            {legs.length > 1 ? "Multiple" : "Single"} ·{" "}
            {new Date(bet.placedAt).toLocaleString("en-NG")}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1 bg-[#172a4a] p-3 text-center text-xs">
          <div>
            <span className="block text-[10px] uppercase text-blue-300">
              Status
            </span>
            <strong
              className={
                bet.status === "won"
                  ? "text-emerald-400"
                  : bet.status === "lost"
                    ? "text-rose-400"
                    : "text-amber-300"
              }
            >
              {bet.status === "won" ? "PAID OUT" : bet.status.toUpperCase()}
            </strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-blue-300">
              Odds
            </span>
            <strong>{odds.toFixed(2)}</strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] uppercase text-blue-300">
              Stake
            </span>
            <span className="block truncate" title={formatMoneyFull(bet.stake)}>
              {formatMoney(bet.stake)}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] uppercase text-blue-300">
              Return
            </span>
            <span
              className="block truncate text-emerald-400"
              title={formatMoneyFull(bet.potentialPayout)}
            >
              {formatMoney(bet.potentialPayout)}
            </span>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto bg-white p-3 text-black">
          <p className="text-sm font-bold">
            {legs.length > 1
              ? "Multiple · " + legs.length + " legs"
              : home + " vs " + away}
          </p>
          <ul className="mt-2 space-y-2">
            {legs.map((leg, i) => {
              const m = matches[leg.matchId];
              const h = m ? teams[m.homeTeamId]?.name ?? "Home" : "Home";
              const a = m ? teams[m.awayTeamId]?.name ?? "Away" : "Away";
              const sel = resolveSelection(
                leg.selectionId,
                leg.selectionLabel
              );
              return (
                <li
                  key={leg.matchId + "-" + i}
                  className="border-t border-gray-100 pt-2 text-xs first:border-0 first:pt-0"
                >
                  <p className="font-semibold leading-snug">
                    {h} vs {a}
                  </p>
                  <p className="text-gray-600">
                    {sel.market} · {sel.pick} @ {Number(leg.odds).toFixed(2)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        {isOpenBet && (
          <div className="border-t border-white/10 bg-[#0b1c36] px-3 pt-3">
            {bookingCode ? (
              <div className="rounded-xl bg-white/10 p-3 text-center">
                <p className="text-[11px] text-white/70">Booking code</p>
                <p className="font-mono text-xl font-bold tracking-widest">
                  {bookingCode}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-emerald-300"
                  onClick={() =>
                    void navigator.clipboard?.writeText(bookingCode)
                  }
                >
                  Copy code
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={bookingBusy}
                onClick={() => void generateBookingCode()}
                className="w-full rounded-xl border border-emerald-400/50 py-2.5 text-sm font-semibold text-emerald-300 disabled:opacity-50"
              >
                {bookingBusy ? "Generating…" : "Get booking code"}
              </button>
            )}
            {bookingErr && (
              <p className="mt-2 text-center text-xs text-rose-300">
                {bookingErr}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 bg-[#0b1c36] p-3">
          {!isOpenBet && (
            <button
              type="button"
              className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm"
              onClick={() => void navigator.clipboard?.writeText(bet.id)}
            >
              Copy ticket ID
            </button>
          )}
          <button
            type="button"
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
                }
