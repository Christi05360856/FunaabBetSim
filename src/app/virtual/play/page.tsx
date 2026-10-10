"use client";

/**
 * Match simulation — pitch + scores + Skip to result (Sporty-style).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clearResult,
  clearTicket,
  loadResult,
  loadTicket,
  type StoredResult,
} from "@/lib/virtual/ticketStore";
import { sfxGoal, sfxLose, sfxWin, bindGlobalAudioUnlock } from "@/lib/casino/sounds";

function chips(n: number) {
  return n.toLocaleString("en-NG");
}

export default function VirtualPlayPage() {
  const router = useRouter();
  const [data, setData] = useState<StoredResult | null>(null);
  const [minute, setMinute] = useState(0);
  const [scores, setScores] = useState<Record<string, { h: number; a: number }>>(
    {}
  );
  const [lastGoal, setLastGoal] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [skip, setSkip] = useState(false);
  const myIds = useRef<Set<string>>(new Set());
  const playedSfx = useRef(false);

  useEffect(() => {
    bindGlobalAudioUnlock();
    const r = loadResult();
    const t = loadTicket();
    if (!r) {
      router.replace("/virtual");
      return;
    }
    if (t) {
      t.legs.forEach((l) => myIds.current.add(l.matchId));
    }
    setData(r);
  }, [router]);

  const byId = useMemo(() => {
    const m: Record<string, { home: string; away: string; league: string }> =
      {};
    (data?.matches || []).forEach((x) => {
      m[x.id] = x;
    });
    return m;
  }, [data]);

  const finals = useMemo(() => {
    const f: Record<string, { h: number; a: number }> = {};
    (data?.results || []).forEach((r) => {
      f[r.matchId] = {
        h: Math.min(6, Math.max(0, r.homeGoals)),
        a: Math.min(6, Math.max(0, r.awayGoals)),
      };
    });
    return f;
  }, [data]);

  const timeline = useMemo(() => {
    const events: Array<{
      minute: number;
      matchId: string;
      side: "home" | "away";
    }> = [];
    (data?.results || []).forEach((r) => {
      const capH = finals[r.matchId]?.h ?? 0;
      const capA = finals[r.matchId]?.a ?? 0;
      let h = 0;
      let a = 0;
      const sorted = [...(r.goals || [])].sort((x, y) => x.minute - y.minute);
      for (const g of sorted) {
        if (g.side === "home") {
          if (h >= capH) continue;
          h++;
        } else {
          if (a >= capA) continue;
          a++;
        }
        events.push({
          minute: Math.min(90, Math.max(1, g.minute)),
          matchId: r.matchId,
          side: g.side,
        });
      }
    });
    events.sort((a, b) => a.minute - b.minute);
    return events;
  }, [data, finals]);

  // Headline match = first of user's legs
  const headlineId = useMemo(() => {
    for (const id of myIds.current) return id;
    return data?.results?.[0]?.matchId;
  }, [data]);

  useEffect(() => {
    if (!data) return;

    const init: Record<string, { h: number; a: number }> = {};
    data.results.forEach((r) => {
      init[r.matchId] = { h: 0, a: 0 };
    });

    if (skip) {
      setScores({ ...finals });
      setMinute(90);
      setDone(true);
      return;
    }

    setScores(init);
    setMinute(0);
    setDone(false);

    let m = 0;
    let idx = 0;
    const running: Record<string, { h: number; a: number }> = { ...init };

    // ~8 seconds for full 90' (Sporty-feel, not endless)
    const id = setInterval(() => {
      m = Math.min(90, m + 5);
      setMinute(m);
      while (idx < timeline.length && timeline[idx]!.minute <= m) {
        const ev = timeline[idx]!;
        const cur = running[ev.matchId] ?? { h: 0, a: 0 };
        const cap = finals[ev.matchId] ?? { h: 0, a: 0 };
        if (ev.side === "home" && cur.h < cap.h) {
          cur.h++;
          const match = byId[ev.matchId];
          setLastGoal(`⚽ ${match?.home ?? "Home"} ${ev.minute}'`);
          sfxGoal();
        } else if (ev.side === "away" && cur.a < cap.a) {
          cur.a++;
          const match = byId[ev.matchId];
          setLastGoal(`⚽ ${match?.away ?? "Away"} ${ev.minute}'`);
          sfxGoal();
        }
        running[ev.matchId] = { ...cur };
        setScores({ ...running });
        idx++;
      }
      if (m >= 90) {
        clearInterval(id);
        setScores({ ...finals });
        setDone(true);
      }
    }, 120);

    return () => clearInterval(id);
  }, [data, skip, timeline, finals, byId]);

  useEffect(() => {
    if (!done || !data || playedSfx.current) return;
    playedSfx.current = true;
    const won = data.settled.some((s) => s.status === "won");
    if (data.settled.length) {
      if (won) sfxWin();
      else sfxLose();
    }
  }, [done, data]);

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-ink-muted">
        Loading match…
      </main>
    );
  }

  const hl = headlineId ? byId[headlineId] : null;
  const hlScore = headlineId
    ? scores[headlineId] ?? { h: 0, a: 0 }
    : { h: 0, a: 0 };

  const myRows = data.results.filter((r) => myIds.current.has(r.matchId));
  const otherRows = data.results.filter((r) => !myIds.current.has(r.matchId));

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg pb-36 text-ink">
      <header className="bg-brand px-3 py-3 text-white">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Instant Virtuals</span>
          <span className="text-xs tabular-nums">
            {done ? "Full time" : `${minute}'`}
          </span>
        </div>
      </header>

      {/* Pitch board */}
      <div className="relative mx-3 mt-3 overflow-hidden rounded-2xl bg-emerald-800 px-4 py-8 text-center text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0 opacity-25">
          <div className="absolute left-1/2 top-0 h-full w-px bg-white" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" />
        </div>
        <p className="relative text-[10px] font-bold uppercase tracking-wider opacity-80">
          {done ? "Final time" : "Quick games"}
        </p>
        {hl && (
          <div className="relative mt-3 flex items-center justify-center gap-3">
            <span className="max-w-[30%] truncate text-sm font-bold">
              {hl.home}
            </span>
            <span className="rounded-lg bg-black/40 px-4 py-2 font-display text-3xl font-extrabold tabular-nums">
              {hlScore.h} - {hlScore.a}
            </span>
            <span className="max-w-[30%] truncate text-sm font-bold">
              {hl.away}
            </span>
          </div>
        )}
        {lastGoal && !done && (
          <p className="relative mt-3 text-xs font-semibold text-emerald-200">
            {lastGoal}
          </p>
        )}
      </div>

      {myRows.length > 0 && (
        <div className="mx-3 mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase text-ink-muted">
            My events
          </p>
          <div className="flex flex-col gap-1.5">
            {myRows.map((r) => {
              const m = byId[r.matchId];
              const sc = scores[r.matchId] ?? { h: 0, a: 0 };
              return (
                <div
                  key={r.matchId}
                  className="flex items-center justify-between rounded-xl border border-brand/25 bg-surface px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {m?.home}
                  </span>
                  <span className="mx-2 font-display text-base font-extrabold tabular-nums">
                    {sc.h} - {sc.a}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right font-semibold">
                    {m?.away}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {otherRows.length > 0 && (
        <div className="mx-3 mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase text-ink-muted">
            League
          </p>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {otherRows.slice(0, 12).map((r) => {
              const m = byId[r.matchId];
              const sc = scores[r.matchId] ?? { h: 0, a: 0 };
              return (
                <div
                  key={r.matchId}
                  className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{m?.home}</span>
                  <span className="mx-2 font-bold tabular-nums">
                    {sc.h}-{sc.a}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right">
                    {m?.away}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {done && data.summary && (
        <p className="mx-3 mt-4 rounded-xl bg-brand/10 px-3 py-3 text-center text-sm font-bold text-brand">
          {data.summary}
        </p>
      )}

      <div
        className="fixed inset-x-0 z-40 border-t border-ink-muted/15 bg-surface px-2 pt-2"
        style={{
          bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="mx-auto max-w-lg">
          {!done ? (
            <button
              type="button"
              onClick={() => setSkip(true)}
              className="w-full rounded-xl border border-ink-muted/25 py-3.5 text-sm font-bold"
            >
              Skip to result
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                clearTicket();
                clearResult();
                router.push("/virtual");
              }}
              className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white"
            >
              Next round
              <span className="mt-0.5 block text-[10px] font-semibold opacity-90">
                {data.summary}
              </span>
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
