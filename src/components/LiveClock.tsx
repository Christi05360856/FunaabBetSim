"use client";

/**
 * FRO (Final Result Only) live clock badge. Never shows a score — only the
 * derived phase/minute from matchClock.ts. Ticks itself every 15s so a match
 * page open through kickoff/HT/FT transitions with nobody touching it.
 */
import { useEffect, useState } from "react";
import { deriveClockState, type ClockState } from "@/lib/domain/matchClock";
import type { Match } from "@/types/domain";

export function useLiveClock(match: Pick<Match, "status" | "kickoffAt">): ClockState {
  const [state, setState] = useState(() => deriveClockState(match));
  useEffect(() => {
    const tick = () => setState(deriveClockState(match));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.status, match.kickoffAt]);
  return state;
}

export function LiveClockBadge({ match }: { match: Pick<Match, "status" | "kickoffAt"> }) {
  const clock = useLiveClock(match);
  const style =
    clock.phase === "first_half" || clock.phase === "second_half"
      ? "bg-loss/15 text-loss"
      : clock.phase === "halftime"
        ? "bg-accent/20 text-accent"
        : clock.phase === "full_time" || clock.phase === "final"
          ? "bg-ink-muted/15 text-ink-muted"
          : "bg-win/15 text-win";

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${style}`}>
      {clock.isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />}
      {clock.display}
    </span>
  );
}
