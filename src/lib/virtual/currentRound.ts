import "server-only";
import {
  dayCommitment,
  lagosDayKey,
  roundSeed,
} from "@/lib/fair/commit";
import {
  generateRoundFromSeed,
  publicMatch,
  resolveRoundResults,
  type VirtualMatchInternal,
} from "@/lib/virtual/engine";
import {
  phaseAt,
  roundId,
  roundWindow,
} from "@/lib/virtual/schedule";
import type { VirtualRoundPublic } from "@/types/virtual";

export function buildCurrentRound(now = Date.now()): {
  public: VirtualRoundPublic;
  internal: VirtualMatchInternal[];
  seed: string;
} {
  const phase = phaseAt(now);
  const dayKey = lagosDayKey(phase.startsAt);
  const seed = roundSeed(dayKey, phase.index);
  const internal = generateRoundFromSeed(seed);
  const pub: VirtualRoundPublic = {
    id: roundId(phase.index),
    index: phase.index,
    startsAt: phase.startsAt,
    kickoffAt: phase.kickoffAt,
    endsAt: phase.endsAt,
    phase: phase.phase,
    dayKey,
    dayCommitment: dayCommitment(dayKey),
    matches: internal.map(publicMatch),
    serverNow: now,
    msToKickoff: phase.msToKickoff,
    msToEnd: phase.msToEnd,
  };
  if (phase.phase !== "betting") {
    pub.results = resolveRoundResults(seed, internal);
  }
  return { public: pub, internal, seed };
}

export function buildRoundByIndex(index: number, now = Date.now()): {
  public: VirtualRoundPublic;
  internal: VirtualMatchInternal[];
  seed: string;
} {
  const { startsAt, kickoffAt, endsAt } = roundWindow(index);
  const dayKey = lagosDayKey(startsAt);
  const seed = roundSeed(dayKey, index);
  const internal = generateRoundFromSeed(seed);
  let phase: VirtualRoundPublic["phase"] = "betting";
  if (now >= endsAt) phase = "result";
  else if (now >= kickoffAt) phase = "live";
  const pub: VirtualRoundPublic = {
    id: roundId(index),
    index,
    startsAt,
    kickoffAt,
    endsAt,
    phase,
    dayKey,
    dayCommitment: dayCommitment(dayKey),
    matches: internal.map(publicMatch),
    serverNow: now,
    msToKickoff: Math.max(0, kickoffAt - now),
    msToEnd: Math.max(0, endsAt - now),
  };
  if (phase !== "betting") {
    pub.results = resolveRoundResults(seed, internal);
  }
  return { public: pub, internal, seed };
}
