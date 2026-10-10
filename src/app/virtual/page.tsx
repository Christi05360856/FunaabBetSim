"use client";

/**
 * Instant Football board — laid out like the football.com reference:
 * red header (back · title · balance · slip) → dark league tabs → market tabs
 * → league bar with column heads → fixture rows (crest · code · stars ·
 * green odds) → bottom bar "Next Round | Betslip".
 *
 * Flow: pick → Betslip → Place bet → /virtual/ticket → Kick Off → /virtual/play
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { CASINO_MAX_STAKE, CASINO_MIN_STAKE } from "@/types/casino";
import type { VirtualMatchPublic, VirtualRoundPublic } from "@/types/virtual";
import { VIRTUAL_LEAGUES, teamCode } from "@/lib/virtual/teamPool";
import {
  MARKET_IDS,
  MARKET_PICKS,
  MARKET_TITLE,
  OU_LINES,
  pickColumn,
  pickText,
  type MarketId,
} from "@/lib/virtual/markets";
import { saveTicket, type StoredLeg } from "@/lib/virtual/ticketStore";
import { balanceText, fmtMs, money } from "@/lib/virtual/format";
import { bindGlobalAudioUnlock, sfxBet, unlockAudio } from "@/lib/casino/sounds";
import Crest from "@/components/virtual/Crest";
import LeagueFlag from "@/components/virtual/LeagueFlag";

const RED = "#e8192c";
const RED_DARK = "#7a0613";
const GREEN = "#12a038";
const CELL = "#d8ebdb";
const CELL_TEXT = "#1d6b2c";

type PickLeg = StoredLeg;
type TabId = "1x2" | "1up" | "2up" | "dc" | "ou" | "btts";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "1x2", label: "1X2" },
  { id: "1up", label: "1X2 - 1UP" },
  { id: "2up", label: "1X2 - 2UP" },
  { id: "dc", label: "Double Chance" },
  { id: "ou", label: "O/U" },
  { id: "btts", label: "GG/NG" },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-[1px] text-[11px] leading-none">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? "#f5b301" : "#c9c9c9" }}>
          ★
        </span>
      ))}
    </span>
  );
}

function offerCount(m: VirtualMatchPublic): number {
  let n = 0;
  for (const id of MARKET_IDS) {
    for (const p of MARKET_PICKS[id]) {
      if ((m.markets?.[id]?.[p] ?? 0) > 0) n += 1;
    }
  }
  return n;
}

export default function VirtualBoardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [league, setLeague] = useState(VIRTUAL_LEAGUES[0]!.id as string);
  const [tab, setTab] = useState<TabId>("1x2");
  const [ouId, setOuId] = useState<MarketId>("ou15");
  const [round, setRound] = useState<VirtualRoundPublic | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [picks, setPicks] = useState<PickLeg[]>([]);
  const [stake, setStake] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);
  const lastRoundId = useRef<string | null>(null);

  const token = useCallback(async () => {
    if (!user) throw new Error("Sign in required");
    return user.getIdToken();
  }, [user]);

  const loadRound = useCallback(
    async (quiet = false) => {
      if (!user) return;
      if (!quiet) setBusy(true);
      try {
        const t = await token();
        const res = await fetch("/api/virtual/round", {
          headers: { Authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setRound(data.round);
        if (typeof data.round?.serverNow === "number") {
          offsetRef.current = data.round.serverNow - Date.now();
        }
        if (typeof data.balance === "number") setBalance(data.balance);
      } catch (e) {
        if (!quiet) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [user, token]
  );

  useEffect(() => {
    if (user) void loadRound(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bindGlobalAudioUnlock();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => clearInterval(id);
  }, []);

  // League reset: new fixtures appear when the shared round ends.
  useEffect(() => {
    if (!round?.endsAt) return;
    if (now >= round.endsAt) void loadRound(true);
  }, [now, round?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // New fixtures → old picks no longer apply.
  useEffect(() => {
    if (!round?.id) return;
    if (lastRoundId.current && lastRoundId.current !== round.id) {
      setPicks([]);
      setDetail(null);
      setErr(null);
    }
    lastRoundId.current = round.id;
  }, [round?.id]);

  const matches = useMemo(
    () => (round?.matches ?? []).filter((m) => m.league === league),
    [round, league]
  );
  const byId = useMemo(() => {
    const o: Record<string, VirtualMatchPublic> = {};
    (round?.matches ?? []).forEach((m) => {
      o[m.id] = m;
    });
    return o;
  }, [round]);

  const marketId: MarketId = tab === "ou" ? ouId : (tab as MarketId);
  const picksForTab = MARKET_PICKS[marketId];

  const totalOdds = useMemo(
    () =>
      picks.length === 0
        ? 1
        : Math.round(picks.reduce((a, p) => a * p.odds, 1) * 100) / 100,
    [picks]
  );
  const stakeNum = Number(stake) || 0;
  const potential = Math.floor(stakeNum * totalOdds * 100) / 100;
  const msToNext = round?.endsAt != null ? Math.max(0, round.endsAt - now) : 0;

  function oddsOf(m: VirtualMatchPublic, market: MarketId, pick: string) {
    return m.markets?.[market]?.[pick] ?? 0;
  }

  function isOn(matchId: string, market: string, pick: string) {
    return picks.some(
      (p) => p.matchId === matchId && p.market === market && p.pick === pick
    );
  }

  function toggle(m: VirtualMatchPublic, market: MarketId, pick: string) {
    const odds = oddsOf(m, market, pick);
    if (odds <= 0) return;
    setErr(null);
    setPicks((prev) => {
      const same = prev.find(
        (p) => p.matchId === m.id && p.market === market && p.pick === pick
      );
      const without = prev.filter((p) => p.matchId !== m.id);
      if (same) return without;
      return [
        ...without,
        {
          matchId: m.id,
          home: m.home,
          away: m.away,
          market,
          pick,
          odds,
          label: pickText(market, pick),
        },
      ];
    });
  }

  async function placeBet() {
    if (!user || !round || busy || picks.length === 0) return;
    if (stakeNum < CASINO_MIN_STAKE || stakeNum > CASINO_MAX_STAKE) {
      setErr(`Stake must be ${CASINO_MIN_STAKE} – ${CASINO_MAX_STAKE}`);
      return;
    }
    if (balance != null && stakeNum > balance) {
      setErr("Insufficient balance");
      return;
    }
    unlockAudio();
    setBusy(true);
    setErr(null);
    try {
      const t = await token();
      const res = await fetch("/api/virtual/bet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stake: stakeNum,
          legs: picks.map((p) => ({
            matchId: p.matchId,
            market: p.market,
            pick: p.pick,
            odds: p.odds,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bet failed");
      if (typeof data.balance === "number") setBalance(data.balance);
      saveTicket({
        roundId: data.roundId ?? round.id,
        betId: data.betId,
        stake: stakeNum,
        potential: data.potential ?? potential,
        legs: [...picks],
        placedAt: Date.now(),
      });
      sfxBet();
      router.push("/virtual/ticket");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white">
        <div className="px-6 text-center">
          <p className="text-lg font-bold text-neutral-900">Instant Football</p>
          <p className="mt-2 text-sm text-neutral-500">Sign in to play for free.</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-md px-6 py-3 text-sm font-bold text-white"
            style={{ background: RED }}
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const leagueLabel =
    VIRTUAL_LEAGUES.find((l) => l.id === league)?.label ?? league;
  const detailMatch = detail ? byId[detail] : null;

  return (
    <div className="fixed inset-0 z-[60] bg-white text-neutral-900">
      <div className="mx-auto flex h-full max-w-lg flex-col">
        {/* Header */}
        <header
          className="flex shrink-0 items-center gap-3 px-4 py-4 text-white"
          style={{ background: RED }}
        >
          <Link href="/casino" aria-label="Back" className="text-2xl leading-none">
            ←
          </Link>
          <h1 className="flex-1 text-[17px] font-normal">Instant Football</h1>
          <span className="text-[15px] font-medium tabular-nums">
            {balance == null ? "…" : balanceText(balance)}
          </span>
          <button
            type="button"
            aria-label="Betslip"
            onClick={() => setSlipOpen(true)}
            className="relative flex h-9 w-8 items-center justify-center"
          >
            <svg width="26" height="30" viewBox="0 0 26 30" fill="none">
              <path
                d="M4 2h18v26l-3-2-3 2-3-2-3 2-3-2-3 2z"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path d="M8 9h10M8 14h10M8 19h6" stroke="#fff" strokeWidth="2" />
            </svg>
            {picks.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold" style={{ color: RED }}>
                {picks.length}
              </span>
            )}
          </button>
        </header>

        {/* League tabs */}
        <nav
          className="flex shrink-0 overflow-x-auto"
          style={{ background: "#3b4046" }}
        >
          {VIRTUAL_LEAGUES.map((lg) => {
            const on = league === lg.id;
            return (
              <button
                key={lg.id}
                type="button"
                onClick={() => setLeague(lg.id)}
                className="relative shrink-0 px-5 py-4 text-[17px]"
                style={{
                  color: on ? "#fff" : "rgba(255,255,255,0.78)",
                  fontWeight: on ? 600 : 400,
                }}
              >
                {lg.label}
                {on && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-[3px]"
                    style={{ background: GREEN }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Market tabs */}
        <div className="shrink-0 border-b border-neutral-200 bg-white">
          <div className="flex overflow-x-auto">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="relative shrink-0 px-5 py-4 text-[17px]"
                  style={{ color: on ? "#222" : "#6b6b6b" }}
                >
                  {t.label}
                  {on && (
                    <span
                      className="absolute inset-x-3 bottom-0 h-[3px]"
                      style={{ background: GREEN }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {tab === "ou" && (
            <div className="flex gap-2 px-4 pb-3">
              {OU_LINES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setOuId(l.id)}
                  className="rounded-full px-4 py-1 text-sm font-semibold"
                  style={{
                    background: ouId === l.id ? GREEN : "#eceeed",
                    color: ouId === l.id ? "#fff" : "#444",
                  }}
                >
                  {l.line}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* League bar with column heads */}
        <div
          className="flex shrink-0 items-center px-3 py-2"
          style={{ background: "#f0f1f0" }}
        >
          <div className="flex flex-1 items-center gap-2 text-[17px] text-neutral-800">
            <LeagueFlag league={league} />
            <span>{leagueLabel}</span>
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-neutral-500 text-[12px] font-bold text-white">
              i
            </span>
          </div>
          <div className="flex w-[58%] gap-1 pr-0.5 text-center text-[15px] text-neutral-500">
            {picksForTab.map((p) => (
              <span key={p} className="flex-1">
                {pickColumn(marketId, p)}
              </span>
            ))}
          </div>
        </div>

        {err && !slipOpen && (
          <p className="shrink-0 bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-600">
            {err}
          </p>
        )}

        {/* Fixtures */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {round == null && (
            <p className="mt-10 text-center text-sm text-neutral-500">Loading…</p>
          )}
          {matches.map((m) => (
            <div
              key={m.id}
              className="flex items-stretch border-b border-neutral-200 px-1 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col justify-between pl-1">
                <div className="flex items-center gap-1.5">
                  <Crest team={m.home} size={30} />
                  <span className="text-[17px] text-neutral-800">
                    {teamCode(m.home)}
                  </span>
                  <span className="text-[15px] text-neutral-400">vs</span>
                  <span className="text-[17px] text-neutral-800">
                    {teamCode(m.away)}
                  </span>
                  <Crest team={m.away} size={30} />
                </div>
                <div className="mt-1 flex items-center justify-between pr-2">
                  <Stars n={m.homeStars ?? 3} />
                  <Stars n={m.awayStars ?? 3} />
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(m.id)}
                  className="mt-1 self-start text-[14px] text-neutral-400"
                >
                  +{offerCount(m)} &gt;
                </button>
              </div>
              <div className="flex w-[58%] items-center gap-1 pr-1">
                {picksForTab.map((p) => {
                  const od = oddsOf(m, marketId, p);
                  const on = isOn(m.id, marketId, p);
                  const off = od <= 0;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={off}
                      onClick={() => toggle(m, marketId, p)}
                      className="flex h-[58px] flex-1 items-center justify-center rounded-[3px] text-[20px] tabular-nums"
                      style={{
                        background: on ? GREEN : off ? "#ececec" : CELL,
                        color: on ? "#fff" : off ? "#b5b5b5" : CELL_TEXT,
                        fontWeight: on ? 700 : 400,
                      }}
                    >
                      {off ? "–" : od.toFixed(2)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex h-14 shrink-0 text-[19px] text-white">
          <button
            type="button"
            onClick={() => void loadRound(false)}
            className="flex flex-1 flex-col items-center justify-center leading-tight"
            style={{ background: "#2b2f33" }}
          >
            Next Round
            <span className="text-[11px] tabular-nums opacity-60">
              {fmtMs(msToNext)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSlipOpen(true)}
            className="flex flex-1 items-center justify-center"
            style={{ background: GREEN }}
          >
            Betslip{picks.length > 0 ? ` (${picks.length})` : ""}
          </button>
        </div>

        {/* All markets for one fixture ("+N >") */}
        {detailMatch && (
          <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50">
            <button
              type="button"
              aria-label="Close"
              className="flex-1"
              onClick={() => setDetail(null)}
            />
            <div className="max-h-[80%] overflow-y-auto rounded-t-2xl bg-white pb-4">
              <div
                className="sticky top-0 flex items-center justify-between px-4 py-3 text-white"
                style={{ background: RED_DARK }}
              >
                <span className="text-[16px] font-semibold">
                  {teamCode(detailMatch.home)} vs {teamCode(detailMatch.away)}
                </span>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              {MARKET_IDS.map((mid) => (
                <div key={mid} className="px-3 pt-3">
                  <p className="mb-1 text-[13px] font-semibold uppercase text-neutral-500">
                    {MARKET_TITLE[mid]}
                    {mid.startsWith("ou")
                      ? ` ${OU_LINES.find((l) => l.id === mid)?.line}`
                      : ""}
                  </p>
                  <div className="flex gap-1">
                    {MARKET_PICKS[mid].map((p) => {
                      const od = oddsOf(detailMatch, mid, p);
                      const on = isOn(detailMatch.id, mid, p);
                      const off = od <= 0;
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={off}
                          onClick={() => toggle(detailMatch, mid, p)}
                          className="flex h-12 flex-1 flex-col items-center justify-center rounded-[3px] text-[13px]"
                          style={{
                            background: on ? GREEN : off ? "#ececec" : CELL,
                            color: on ? "#fff" : off ? "#b5b5b5" : CELL_TEXT,
                          }}
                        >
                          <span className="opacity-80">{pickText(mid, p)}</span>
                          <span className="text-[16px] font-semibold tabular-nums">
                            {off ? "–" : od.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Betslip */}
        {slipOpen && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50">
            <button
              type="button"
              aria-label="Close"
              className="flex-1"
              onClick={() => setSlipOpen(false)}
            />
            <div className="flex max-h-[85%] flex-col rounded-t-2xl bg-white">
              <div
                className="flex items-center justify-between rounded-t-2xl px-4 py-3 text-white"
                style={{ background: "#2b2f33" }}
              >
                <span className="text-[17px] font-semibold">
                  Betslip ({picks.length})
                </span>
                <div className="flex items-center gap-4">
                  {picks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPicks([])}
                      className="text-sm opacity-80"
                    >
                      Remove all
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSlipOpen(false)}
                    className="text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {picks.length === 0 && (
                  <p className="px-4 py-10 text-center text-sm text-neutral-500">
                    Tap odds to add selections.
                  </p>
                )}
                {picks.map((p) => (
                  <div
                    key={p.matchId}
                    className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3"
                  >
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() =>
                        setPicks((prev) =>
                          prev.filter((x) => x.matchId !== p.matchId)
                        )
                      }
                      className="text-xl leading-none text-neutral-400"
                    >
                      ×
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">
                        {p.label}
                      </p>
                      <p className="text-[13px] text-neutral-500">
                        {MARKET_TITLE[p.market]} · {teamCode(p.home)} vs{" "}
                        {teamCode(p.away)}
                      </p>
                    </div>
                    <span
                      className="text-[17px] font-bold tabular-nums"
                      style={{ color: CELL_TEXT }}
                    >
                      {p.odds.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="shrink-0 border-t border-neutral-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[15px] text-neutral-600">Stake</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={CASINO_MIN_STAKE}
                    max={CASINO_MAX_STAKE}
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    aria-label="Stake amount"
                    className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-right text-[18px] font-semibold tabular-nums outline-none focus:border-green-600"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  {[100, 500, 1000, 5000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setStake(String((Number(stake) || 0) + v))}
                      className="flex-1 rounded bg-neutral-100 py-1.5 text-sm font-semibold text-neutral-700"
                    >
                      +{v.toLocaleString("en-NG")}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-between text-[15px]">
                  <span className="text-neutral-600">Total Odds</span>
                  <span className="font-semibold tabular-nums">
                    {picks.length ? totalOdds.toFixed(2) : "—"}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-[15px]">
                  <span className="text-neutral-600">Potential Win</span>
                  <span className="font-bold tabular-nums" style={{ color: CELL_TEXT }}>
                    {money(picks.length ? potential : 0)}
                  </span>
                </div>
                {err && (
                  <p className="mt-2 text-center text-xs font-medium text-red-600">
                    {err}
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || picks.length === 0}
                  onClick={() => void placeBet()}
                  className="mt-3 w-full rounded py-3.5 text-[18px] font-semibold text-white disabled:opacity-40"
                  style={{ background: GREEN }}
                >
                  {busy ? "Placing…" : "Place Bet"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
