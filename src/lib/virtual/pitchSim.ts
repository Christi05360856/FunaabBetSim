/**
 * Live-pitch timeline — client-safe, deterministic.
 *
 * Follows the spec: the match outcome is already decided by the server
 * (score + goal minutes). Here we only turn that into a passive playback
 * track: one tick per match minute with a ball position on a 0–100 grid,
 * possession, a state-machine zone, and an event. The canvas just plays it
 * back and smooths it with linear interpolation.
 *
 * Zones (x is left→right, home attacks right):
 *   MIDFIELD     x 35–65, y 10–90
 *   ATTACK_HOME  x 60–95, y 15–85   (home pressing)
 *   ATTACK_AWAY  x  5–40, y 15–85   (away pressing)
 *   GOAL (home)  x 100,   y 45–55   (ball in the away net)
 *   GOAL (away)  x   0,   y 45–55   (ball in the home net)
 */
import type { GoalEvent } from "./markets";

export type PitchState =
  | "MIDFIELD"
  | "ATTACK_HOME"
  | "ATTACK_AWAY"
  | "SHOT"
  | "GOAL"
  | "KICKOFF";

export type PitchEvent =
  | "GOAL_HOME"
  | "GOAL_AWAY"
  | "SHOT_SAVED"
  | "SHOT_OFF"
  | "HALF_TIME"
  | "FULL_TIME";

export type PitchTick = {
  minute: number;
  x: number;
  y: number;
  possession: "home" | "away";
  state: PitchState;
  event?: PitchEvent;
};

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Build 91 ticks (minute 0…90) for one match. Same seed → same track. */
export function buildPitchTimeline(
  seed: string,
  goals: GoalEvent[]
): PitchTick[] {
  const rand = mulberry32(hashSeed(seed));
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  const goalAt = new Map<number, GoalEvent["side"]>();
  [...goals]
    .sort((a, b) => a.minute - b.minute)
    .forEach((g) => {
      let m = clamp(Math.round(g.minute), 1, 90);
      while (goalAt.has(m) && m < 90) m += 1; // never two goals on one tick
      goalAt.set(m, g.side);
    });

  // The two minutes before a goal are forced into the scorer's attack so the
  // ball visibly builds up to it.
  const buildUp = new Map<number, GoalEvent["side"]>();
  goalAt.forEach((side, m) => {
    for (let k = 1; k <= 2; k++) {
      if (m - k >= 1 && !goalAt.has(m - k)) buildUp.set(m - k, side);
    }
  });

  const ticks: PitchTick[] = [];
  let poss: "home" | "away" = rand() < 0.5 ? "home" : "away";
  ticks.push({ minute: 0, x: 50, y: 50, possession: poss, state: "KICKOFF" });

  for (let m = 1; m <= 90; m++) {
    const scorer = goalAt.get(m);
    if (scorer) {
      poss = scorer;
      ticks.push({
        minute: m,
        x: scorer === "home" ? 100 : 0,
        y: between(46, 54),
        possession: scorer,
        state: "GOAL",
        event: scorer === "home" ? "GOAL_HOME" : "GOAL_AWAY",
      });
      continue;
    }

    const prev = ticks[ticks.length - 1]!;
    if (prev.state === "GOAL") {
      // Restart from the centre spot; the conceding side kicks off.
      poss = prev.possession === "home" ? "away" : "home";
      ticks.push({ minute: m, x: 50, y: 50, possession: poss, state: "KICKOFF" });
      continue;
    }

    const forced = buildUp.get(m);
    if (forced) {
      poss = forced;
      ticks.push({
        minute: m,
        x: forced === "home" ? between(72, 92) : between(8, 28),
        y: between(25, 75),
        possession: forced,
        state: forced === "home" ? "ATTACK_HOME" : "ATTACK_AWAY",
      });
      continue;
    }

    if (rand() < 0.28) poss = poss === "home" ? "away" : "home";

    const roll = rand();
    if (roll < 0.42) {
      ticks.push({
        minute: m,
        x: between(35, 65),
        y: between(10, 90),
        possession: poss,
        state: "MIDFIELD",
      });
    } else if (roll < 0.9) {
      ticks.push({
        minute: m,
        x: poss === "home" ? between(60, 95) : between(5, 40),
        y: between(15, 85),
        possession: poss,
        state: poss === "home" ? "ATTACK_HOME" : "ATTACK_AWAY",
      });
    } else {
      // A shot that does not become a goal.
      const saved = rand() < 0.65;
      const shooter = poss;
      poss = poss === "home" ? "away" : "home";
      ticks.push({
        minute: m,
        x: shooter === "home" ? between(95, 99) : between(1, 5),
        y: saved ? between(42, 58) : between(28, 72),
        possession: poss,
        state: "SHOT",
        event: saved ? "SHOT_SAVED" : "SHOT_OFF",
      });
    }
  }

  const ht = ticks[45];
  if (ht && !ht.event) ht.event = "HALF_TIME";
  const ft = ticks[90];
  if (ft && !ft.event) ft.event = "FULL_TIME";
  return ticks;
}

/** Ball position at a fractional match minute (linear interpolation). */
export function sampleBall(
  ticks: PitchTick[],
  minute: number
): { x: number; y: number; possession: "home" | "away" } {
  const m = clamp(minute, 0, 90);
  const i = Math.min(ticks.length - 2, Math.floor(m));
  const a = ticks[i]!;
  const b = ticks[i + 1] ?? a;
  const f = m - i;
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    possession: f < 0.5 ? a.possession : b.possession,
  };
}

/** 4-4-2 base positions, home attacking right (0–100 grid). */
export const FORMATION_HOME: Array<[number, number]> = [
  [4, 50],
  [20, 15], [18, 38], [18, 62], [20, 85],
  [38, 15], [35, 38], [35, 62], [38, 85],
  [55, 38], [55, 62],
];

export const FORMATION_AWAY: Array<[number, number]> = FORMATION_HOME.map(
  ([x, y]) => [100 - x, y] as [number, number]
);

/** Wall-clock pacing: how long one match minute lasts on screen. */
export const MS_PER_MINUTE = 330;
export const HALF_TIME_PAUSE_MS = 1800;
