"use client";

/**
 * Quick Games (live pitch + scoreboard) → Results, like the Instant Virtuals
 * reference.
 *
 * The server already settled the ticket at Kick Off, so this screen is a
 * passive playback: a match clock runs 0→90 (with a half-time pause), the
 * canvas plays the precomputed ball track, and every score is derived from
 * the goal minutes. "Skip to Result" jumps straight to the final screen.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  clearResult,
  clearTicket,
  loadResult,
  loadTicket,
  type StoredResult,
  type StoredTicket,
} from "@/lib/virtual/ticketStore";
import {
  legWins,
  MARKET_TITLE,
  scoreAt,
  type GoalEvent,
} from "@/lib/virtual/markets";
import {
  buildPitchTimeline,
  HALF_TIME_PAUSE_MS,
  MS_PER_MINUTE,
} from "@/lib/virtual/pitchSim";
import { teamCode, VIRTUAL_LEAGUES } from "@/lib/virtual/teamPool";
import { balanceText, money } from "@/lib/virtual/format";
import {
  bindGlobalAudioUnlock,
  sfxGoal,
  sfxLose,
  sfxWin,
} from "@/lib/casino/sounds";
import PitchCanvas from "@/components/virtual/PitchCanvas";
import Crest from "@/components/virtual/Crest";
import LeagueFlag from "@/components/virtual/LeagueFlag";

const PURPLE = "var(--color-brand)";
const CARD = "color-mix(in srgb, var(--color-text-muted) 12%, var(--color-surface))";

type MatchInfo = { id: string; home: string; away: string; league: string };
type Overlay = { kind: "goal" | "ht" | "ft"; key: number } | null;

function Ball({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#2b2b2b" />
      <path
        d="M10 5.5 14 8.4 12.5 13H7.5L6 8.4z"
        fill="#fff"
        opacity="0.9"
      />
    </svg>
  );
}

function Trophy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={PURPLE} aria-hidden>
      <path d="M6 3h12v3h3v2a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15v2h3v3H8v-3h3v-2a5 5 0 0 1-3.7-3H7a4 4 0 0 1-4-4V6h3zM5 8a2 2 0 0 0 1.4 1.9A9 9 0 0 1 6 8zm14 0h-1.4a9 9 0 0 1-.4 1.9A2 2 0 0 0 19 8z" />
    </svg>
  );
}

/** Grey fixture card with half-clipped crests on both edges. */
function MatchCard({
  m,
  h,
  a,
  live,
  expandable,
  expanded,
  onToggle,
  children,
}: {
  m: MatchInfo;
  h: number;
  a: number;
  live?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ background: CARD }}
    >
      <div className="absolute -left-2 top-1/2 -translate-y-1/2">
        <Crest team={m.home} size={36} />
      </div>
      <div className="absolute -right-2 top-1/2 -translate-y-1/2">
        <Crest team={m.away} size={36} />
      </div>
      <button
        type="button"
        disabled={!expandable}
        onClick={onToggle}
        className="relative flex w-full flex-col items-center px-9 py-2"
      >
        {live && <Ball size={11} />}
        <div className="flex items-center gap-2.5 text-[14px] text-ink tabular-nums">
          <span>{teamCode(m.home)}</span>
          <span>
            {h} - {a}
          </span>
          <span>{teamCode(m.away)}</span>
        </div>
        {expandable && (
          <span className="text-[11px] leading-none text-ink-muted">
            {expanded ? "⌃" : "⌄"}
          </span>
        )}
      </button>
      {children}
    </div>
  );
}

export default function VirtualPlayPage() {
  const router = useRouter();
  const [data, setData] = useState<StoredResult | null>(null);
  const [ticket, setTicket] = useState<StoredTicket | null>(null);
  const [view, setView] = useState<"play" | "results">("play");
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<"live" | "ht" | "ft">("live");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [hidePitch, setHidePitch] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resultTab, setResultTab] = useState<string>("mine");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const minuteRef = useRef(0);
  const skippedRef = useRef(false);
  const soundedRef = useRef(false);

  useEffect(() => {
    bindGlobalAudioUnlock();
    const r = loadResult();
    const t = loadTicket();
    if (!r) {
      router.replace("/virtual");
      return;
    }
    setTicket(t);
    setData(r);
  }, [router]);

  const matchById = useMemo(() => {
    const o: Record<string, MatchInfo> = {};
    (data?.matches ?? []).forEach((x) => {
      o[x.id] = x;
    });
    return o;
  }, [data]);

  const goalsById = useMemo(() => {
    const o: Record<string, GoalEvent[]> = {};
    (data?.results ?? []).forEach((r) => {
      o[r.matchId] = [...(r.goals ?? [])].sort((a, b) => a.minute - b.minute);
    });
    return o;
  }, [data]);

  const myIds = useMemo(
    () => new Set((ticket?.legs ?? []).map((l) => l.matchId)),
    [ticket]
  );

  const headlineId = useMemo(() => {
    const first = ticket?.legs?.[0]?.matchId;
    return first ?? data?.results?.[0]?.matchId ?? null;
  }, [ticket, data]);

  const ticks = useMemo(() => {
    if (!data || !headlineId) return null;
    return buildPitchTimeline(
      `${data.roundId}:${headlineId}`,
      goalsById[headlineId] ?? []
    );
  }, [data, headlineId, goalsById]);

  const totalWon = useMemo(
    () => (data?.settled ?? []).reduce((a, s) => a + (s.payout || 0), 0),
    [data]
  );

  // ---- match clock -------------------------------------------------------
  useEffect(() => {
    if (!data || view !== "play") return;
    let raf = 0;
    let last = performance.now();
    let pausedUntil = 0;
    let htDone = false;
    let ftTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHalf = -1;
    const announced = new Set<string>();
    let overlayKey = 0;
    let overlayTimer: ReturnType<typeof setTimeout> | null = null;
    let phaseIsHt = false;
    const watchIds: string[] = myIds.size
      ? Array.from(myIds)
      : headlineId
        ? [headlineId]
        : [];

    const showOverlay = (kind: "goal" | "ht" | "ft", ms: number) => {
      overlayKey += 1;
      setOverlay({ kind, key: overlayKey });
      if (overlayTimer) clearTimeout(overlayTimer);
      if (kind !== "ft") {
        overlayTimer = setTimeout(() => setOverlay(null), ms);
      }
    };

    const step = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;

      if (!skippedRef.current) {
        if (t < pausedUntil) {
          // half-time pause: clock frozen
        } else {
          if (pausedUntil && phaseIsHt) {
            phaseIsHt = false;
            setPhase("live");
          }
          const next = Math.min(90, minuteRef.current + dt / MS_PER_MINUTE);
          if (!htDone && next >= 45) {
            minuteRef.current = 45;
            htDone = true;
            pausedUntil = t + HALF_TIME_PAUSE_MS;
            phaseIsHt = true;
            setPhase("ht");
            showOverlay("ht", HALF_TIME_PAUSE_MS);
          } else {
            minuteRef.current = next;
          }
        }
      }

      const m = minuteRef.current;
      const half = Math.floor(m * 2);
      if (half !== lastHalf) {
        lastHalf = half;
        setMinute(m);

        // Goals that just happened in the matches the player cares about.
        let goalSound = false;
        for (const id of watchIds) {
          (goalsById[id] ?? []).forEach((g, i) => {
            const key = `${id}:${i}`;
            if (g.minute <= Math.floor(m) && !announced.has(key)) {
              announced.add(key);
              goalSound = true;
              if (id === headlineId && Math.floor(m) < 90) {
                showOverlay("goal", 2600);
              }
            }
          });
        }
        if (goalSound) sfxGoal();
      }

      if (m >= 90) {
        setMinute(90);
        setPhase("ft");
        showOverlay("ft", 0);
        if (!soundedRef.current) {
          soundedRef.current = true;
          if (data.settled.length) {
            if (data.settled.some((s) => s.status === "won")) sfxWin();
            else sfxLose();
          }
        }
        ftTimer = setTimeout(() => setView("results"), 3800);
        return;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (ftTimer) clearTimeout(ftTimer);
      if (overlayTimer) clearTimeout(overlayTimer);
    };
  }, [data, view, goalsById, myIds, headlineId]);

  function skipToResult() {
    skippedRef.current = true;
    minuteRef.current = 90;
    setMinute(90);
    setPhase("ft");
    if (data && !soundedRef.current) {
      soundedRef.current = true;
      if (data.settled.length) {
        if (data.settled.some((s) => s.status === "won")) sfxWin();
        else sfxLose();
      }
    }
    setView("results");
  }

  function nextRound() {
    clearTicket();
    clearResult();
    router.push("/virtual");
  }

  function toggleOne(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-surface text-sm text-ink-muted">
        Loading match…
      </div>
    );
  }

  const finished = view === "results" || phase === "ft";
  const shownBalance =
    data.balance == null
      ? null
      : finished
        ? data.balance
        : data.balance - totalWon;

  const scoreOf = (id: string) => {
    const g = goalsById[id] ?? [];
    return scoreAt(g, finished ? 90 : Math.floor(minute));
  };

  const myResults = data.results.filter((r) => myIds.has(r.matchId));
  const leagueGroups = VIRTUAL_LEAGUES.map((lg) => ({
    lg,
    rows: data.results.filter((r) => matchById[r.matchId]?.league === lg.id),
  })).filter((g) => g.rows.length > 0);

  const head = headlineId ? matchById[headlineId] : null;
  const headScore = headlineId ? scoreOf(headlineId) : { h: 0, a: 0 };

  const header = (
    <header className="flex shrink-0 items-center gap-2.5 bg-surface px-3 py-2.5 shadow-card">
      <h1 className="flex-1 text-[15px] font-light text-ink-muted">
        Instant Virtuals
      </h1>
      <span
        className="relative rounded-full border px-3 py-1.5 text-[12px] tabular-nums"
        style={{ borderColor: PURPLE, color: PURPLE }}
      >
        {shownBalance == null ? "…" : balanceText(shownBalance)}
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
    </header>
  );

  // ======================= RESULTS ========================================
  if (view === "results") {
    const tabs = [
      { id: "mine", label: "My Events" },
      ...VIRTUAL_LEAGUES.map((l) => ({ id: l.id as string, label: l.label })),
    ];
    const rows =
      resultTab === "mine"
        ? myResults
        : data.results.filter(
            (r) => matchById[r.matchId]?.league === resultTab
          );

    return (
      <div className="fixed inset-0 z-[60] bg-bg text-ink">
        <div className="mx-auto flex h-full max-w-lg flex-col">
          {header}
          <nav className="flex shrink-0 items-center overflow-x-auto bg-surface px-2 shadow-card">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setResultTab(t.id)}
                className="shrink-0 px-3 py-2.5 text-[13px]"
                style={{
                  color: resultTab === t.id ? PURPLE : "var(--color-text-muted)",
                  fontWeight: resultTab === t.id ? 500 : 400,
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-4">
            <div className="flex flex-col gap-3">
              {rows.map((r) => {
                const m = matchById[r.matchId];
                if (!m) return null;
                const goals = goalsById[r.matchId] ?? [];
                const fh = scoreAt(goals, 45);
                const legs = (ticket?.legs ?? []).filter(
                  (l) => l.matchId === r.matchId
                );
                return (
                  <div key={r.matchId} className="relative overflow-hidden rounded-lg" style={{ background: CARD }}>
                    <div className="absolute -left-2 top-3">
                      <Crest team={m.home} size={36} />
                    </div>
                    <div className="absolute -right-2 top-3">
                      <Crest team={m.away} size={36} />
                    </div>
                    <div className="relative px-9 pt-3 pb-2 text-center">
                      <div className="flex items-center justify-center gap-3 text-[14px] text-ink tabular-nums">
                        <span>{teamCode(m.home)}</span>
                        <span className="font-medium">
                          {r.homeGoals}-{r.awayGoals}
                        </span>
                        <span>{teamCode(m.away)}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-ink-muted">
                        First Half {fh.h}-{fh.a}
                      </p>
                    </div>
                    {legs.map((l) => {
                      const won = legWins(
                        { homeGoals: r.homeGoals, awayGoals: r.awayGoals },
                        goals,
                        l.market,
                        l.pick
                      );
                      return (
                        <div
                          key={`${l.market}-${l.pick}`}
                          className="relative mx-[14%] flex items-center border-t border-ink-muted/20 py-2 text-[13px] text-ink-muted"
                        >
                          <span className="w-[16%]">
                            {won ? <Trophy /> : "Lost"}
                          </span>
                          <span className="flex-[1.1]">
                            {ticket && ticket.legs.length > 1 ? "Multiple" : "Single"} 01
                          </span>
                          <span className="flex-1 text-center">
                            {MARKET_TITLE[l.market]}
                          </span>
                          <span className="flex-[1.3] text-right">
                            {l.label} @{l.odds.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                    {legs.length > 0 && <div className="h-2" />}
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="py-10 text-center text-sm text-ink-muted">
                  No matches here.
                </p>
              )}
            </div>
          </div>

          {/* Ticket details sheet */}
          {detailsOpen && ticket && (
            <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50">
              <button
                type="button"
                aria-label="Close"
                className="flex-1"
                onClick={() => setDetailsOpen(false)}
              />
              <div className="max-h-[75%] overflow-y-auto rounded-t-2xl bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">Ticket Details</span>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(false)}
                    className="text-2xl leading-none text-ink-muted"
                  >
                    ×
                  </button>
                </div>
                {ticket.legs.map((l) => {
                  const r = data.results.find((x) => x.matchId === l.matchId);
                  const won = r
                    ? legWins(
                        { homeGoals: r.homeGoals, awayGoals: r.awayGoals },
                        goalsById[l.matchId],
                        l.market,
                        l.pick
                      )
                    : false;
                  return (
                    <div
                      key={`${l.matchId}-${l.market}`}
                      className="mt-3 flex items-center justify-between border-b border-ink-muted/15 pb-3 text-[12px]"
                    >
                      <div>
                        <p className="font-semibold">
                          {l.label} @{l.odds.toFixed(2)}
                        </p>
                        <p className="text-ink-muted">
                          {MARKET_TITLE[l.market]} · {teamCode(l.home)} vs{" "}
                          {teamCode(l.away)}
                          {r ? ` · ${r.homeGoals}-${r.awayGoals}` : ""}
                        </p>
                      </div>
                      <span
                        className="font-semibold"
                        style={{ color: won ? "var(--color-win)" : "var(--color-loss)" }}
                      >
                        {won ? "Won" : "Lost"}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-3 flex justify-between text-[12px]">
                  <span className="text-ink-muted">Stake</span>
                  <span className="font-semibold tabular-nums">{money(ticket.stake)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[12px]">
                  <span className="text-ink-muted">Total Won</span>
                  <span className="font-semibold tabular-nums">{money(totalWon)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex h-12 shrink-0 text-[14px]">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="flex flex-[0.85] items-center justify-center bg-ink-muted/15 text-ink-muted"
            >
              Ticket Details
            </button>
            <button
              type="button"
              onClick={nextRound}
              className="flex flex-1 flex-col items-center justify-center leading-tight text-white"
              style={{ background: PURPLE }}
            >
              Next Round
              <span className="text-[11px]">
                Total Won: {balanceText(totalWon)}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ======================= QUICK GAMES ====================================
  return (
    <div className="fixed inset-0 z-[60] bg-bg text-ink">
      <div className="mx-auto flex h-full max-w-lg flex-col">
        {header}
        <div className="shrink-0 border-b border-ink-muted/15 bg-surface py-2 text-center text-[14px] text-ink-muted">
          Quick Games
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Live pitch */}
          {!hidePitch && ticks && head && (
            <div className="relative bg-black">
              <div className="relative mx-auto aspect-[8/3] w-[90%]">
                <PitchCanvas
                  ticks={ticks}
                  minuteRef={minuteRef}
                  seed={`${data.roundId}:${headlineId}`}
                />
                {overlay && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-[70%] overflow-hidden rounded-xl shadow-lg">
                      <div
                        className="flex items-center justify-between px-3 py-2 text-white"
                        style={{
                          background:
                            "linear-gradient(90deg,#c62828 0%,#6d3fa6 50%,#1e6bff 100%)",
                        }}
                      >
                        <span className="text-[17px] font-light">
                          {teamCode(head.home)}
                        </span>
                        <span className="text-[17px] font-light">
                          {teamCode(head.away)}
                        </span>
                      </div>
                      <div className="bg-black/60 px-3 py-2 text-center text-white backdrop-blur-sm">
                        <div className="text-[28px] font-extralight leading-none tabular-nums">
                          {headScore.h} - {headScore.a}
                        </div>
                        <div className="mt-1 text-[12px] tracking-wide opacity-80">
                          {overlay.kind === "ft"
                            ? "FINAL TIME"
                            : overlay.kind === "ht"
                              ? "HALF TIME"
                              : "GOAL!"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="relative flex justify-center">
            <button
              type="button"
              onClick={() => setHidePitch((v) => !v)}
              className={`z-10 rounded-t-md bg-black/55 px-3 py-0.5 text-[12px] text-white ${
                hidePitch ? "mt-2 rounded-md bg-black/70" : "-mt-6"
              }`}
            >
              {hidePitch ? "Show ▾" : "Hide ▴"}
            </button>
          </div>

          <div className="flex justify-center py-5">
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) =>
                  prev.size > 0
                    ? new Set()
                    : new Set(data.results.map((r) => r.matchId))
                )
              }
              className="rounded border px-6 py-2.5 text-[13px]"
              style={{ borderColor: PURPLE, color: PURPLE }}
            >
              {expanded.size > 0 ? "Collapse All" : "Expand All"}
            </button>
          </div>

          <div className="px-3 pb-6">
            {myResults.length > 0 && (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-full bg-ink-muted/15 py-1 pr-4 pl-1 text-[13px] text-ink-muted">
                  <span className="flex h-7 w-7 items-center justify-center">
                    <Ball size={18} />
                  </span>
                  My Events
                </div>
                <div className="mb-5 flex flex-col gap-2">
                  {myResults.map((r) => {
                    const m = matchById[r.matchId];
                    if (!m) return null;
                    const sc = scoreOf(r.matchId);
                    const open = expanded.has(r.matchId);
                    const goals = (goalsById[r.matchId] ?? []).filter(
                      (g) => g.minute <= (finished ? 90 : Math.floor(minute))
                    );
                    return (
                      <MatchCard
                        key={r.matchId}
                        m={m}
                        h={sc.h}
                        a={sc.a}
                        live={!finished}
                        expandable
                        expanded={open}
                        onToggle={() => toggleOne(r.matchId)}
                      >
                        {open && (
                          <div className="relative border-t border-ink-muted/20 px-9 py-2 text-center text-[11px] text-ink-muted">
                            {goals.length === 0
                              ? "No goals yet"
                              : goals.map((g, i) => (
                                  <div key={i}>
                                    {g.minute}&apos; ⚽{" "}
                                    {teamCode(g.side === "home" ? m.home : m.away)}
                                  </div>
                                ))}
                          </div>
                        )}
                      </MatchCard>
                    );
                  })}
                </div>
              </>
            )}

            {leagueGroups.map(({ lg, rows }) => (
              <div key={lg.id} className="mb-5">
                <div className="mb-3 flex items-center gap-2 rounded-full bg-ink-muted/15 py-1 pr-4 pl-1 text-[13px] text-ink-muted">
                  <span className="flex h-7 w-7 items-center justify-center">
                    <LeagueFlag league={lg.id} size={22} />
                  </span>
                  {lg.label}
                </div>
                <div className="flex flex-col gap-2">
                  {rows
                    .filter((r) => !myIds.has(r.matchId))
                    .map((r) => {
                      const m = matchById[r.matchId];
                      if (!m) return null;
                      const sc = scoreOf(r.matchId);
                      const open = expanded.has(r.matchId);
                      const goals = (goalsById[r.matchId] ?? []).filter(
                        (g) => g.minute <= (finished ? 90 : Math.floor(minute))
                      );
                      return (
                        <MatchCard
                          key={r.matchId}
                          m={m}
                          h={sc.h}
                          a={sc.a}
                          expandable={expanded.size > 0 || open}
                          expanded={open}
                          onToggle={() => toggleOne(r.matchId)}
                        >
                          {open && (
                            <div className="relative border-t border-ink-muted/20 px-9 py-2 text-center text-[11px] text-ink-muted">
                              {goals.length === 0
                                ? "No goals yet"
                                : goals.map((g, i) => (
                                    <div key={i}>
                                      {g.minute}&apos; ⚽{" "}
                                      {teamCode(g.side === "home" ? m.home : m.away)}
                                    </div>
                                  ))}
                            </div>
                          )}
                        </MatchCard>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={skipToResult}
          className="h-12 shrink-0 text-[14px] text-white"
          style={{ background: PURPLE }}
        >
          Skip to Result
        </button>
      </div>
    </div>
  );
}
