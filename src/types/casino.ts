/**
 * Chips are never withdrawable and never mix with purchased/promo.
 */

export const CASINO_START_CHIPS = 10_000;
export const CASINO_RELOAD_CHIPS = 5_000;
export const CASINO_RELOAD_COOLDOWN_MS = 60 * 60 * 1000;

export const CASINO_MIN_STAKE = 10;
export const CASINO_MAX_STAKE = 5_000;
export const CASINO_HOUSE_EDGE = 0.01;

export type CasinoGameId =
  | "dice"
  | "coin"
  | "mines"
  | "wheel"
  | "crash"
  | "thimbles"
  | "campus-crash"
  | "penalty"
  | "plinko"
  | "hilo"
  | "keno"
  | "penalty-series";

export interface CasinoGameMeta {
  id: CasinoGameId;
  name: string;
  blurb: string;
  playReady: boolean;
}

export const CASINO_GAMES: CasinoGameMeta[] = [
  { id: "dice", name: "Dice", blurb: "Roll over / under a target", playReady: true },
  { id: "coin", name: "Coin Flip", blurb: "Heads or tails", playReady: true },
  { id: "mines", name: "Mines", blurb: "Clear tiles, avoid bombs", playReady: true },
  { id: "wheel", name: "Wheel", blurb: "Spin for a multiplier", playReady: true },
  { id: "crash", name: "Crash Lite", blurb: "Cash out before it crashes", playReady: true },
  { id: "thimbles", name: "Thimbles", blurb: "Find the ball under 3 cups", playReady: true },
  { id: "campus-crash", name: "Campus Crash", blurb: "Cash out before the bus crashes", playReady: true },
  { id: "penalty", name: "Penalty", blurb: "One shot — beat the keeper", playReady: true },
  { id: "plinko", name: "Plinko", blurb: "Drop the ball, hit a multiplier", playReady: true },
  { id: "hilo", name: "Hi-Lo", blurb: "Higher or lower than the card", playReady: true },
  { id: "keno", name: "Keno", blurb: "Pick numbers, match the draw", playReady: true },
  { id: "penalty-series", name: "Penalty Series", blurb: "5 shots — score to multiply", playReady: true },
];

export interface CasinoDemoWallet {
  uid: string;
  balance: number;
  startedAt: number;
  lastReloadAt: number | null;
  updatedAt: number;
}

export type DiceDirection = "under" | "over";
export type CoinSide = "heads" | "tails";
export type PenaltySide = "left" | "center" | "right";
export type HiloChoice = "higher" | "lower";

export const MINES_GRID = 25;
export const MINES_MIN = 1;
export const MINES_MAX = 10;

export const THIMBLES_CUPS = 3;
export const THIMBLES_MULT =
  Math.floor((THIMBLES_CUPS * (1 - CASINO_HOUSE_EDGE)) * 100) / 100;

/**
 * Penalty: keeper dives left / centre / right at random, so a shot scores with
 * probability 2/3. Fair multiplier is 1.5x; minus the 1% edge, floored → 1.48x
 * (return-to-player ≈ 98.7%).
 */
export const PENALTY_MULT = 1.48;

/**
 * 12 equally likely segments. Average multiplier = 11.8 / 12 → return-to-player
 * ≈ 98.3%. (The previous table averaged 2.32x, i.e. paid players 232%.)
 */
export const WHEEL_SEGMENTS = [0, 0.4, 0.8, 1.2, 1.5, 3, 0, 0.4, 0.8, 1.2, 1.5, 1] as const;

/** Plinko: 17 buckets (16 peg rows), Stake-style low risk. */
export const PLINKO_SLOTS = [
  16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5,
  1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16,
] as const;
export const PLINKO_ROWS = 16;

/** Hi-Lo card range 1–13 (Ace–King face value). */
export const HILO_MIN = 1;
export const HILO_MAX = 13;

/** Keno: pick from 1–40, draw 10 balls. */
export const KENO_POOL = 40;
export const KENO_DRAW = 10;
export const KENO_MAX_PICKS = 10;

/**
 * Keno payout table: [pickCount][hits] = multiplier.
 * Sparse — only defined cells pay; others 0.
 * Tuned from the exact hypergeometric odds (40 numbers, 10 drawn) so every
 * pick size returns ≈ 97%. Top prizes capped at 2500x.
 */
export const KENO_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 3.87 },
  2: { 2: 16.81 },
  3: { 2: 2.51, 3: 51.54 },
  4: { 2: 1.66, 3: 8.33, 4: 124 },
  5: { 3: 5.34, 4: 32.09, 5: 624 },
  6: { 3: 2.99, 4: 11.99, 5: 104, 6: 1799 },
  7: { 3: 2.16, 4: 5.76, 5: 36.06, 6: 288, 7: 2500 },
  8: { 4: 5.77, 5: 23.09, 6: 153, 7: 1000, 8: 2500 },
  9: { 4: 3.49, 5: 12.23, 6: 61.17, 7: 436, 8: 1000, 9: 2500 },
  10: { 5: 11.82, 6: 47.31, 7: 236, 8: 500, 9: 1000, 10: 2500 },
};

/** Penalty series: 5 shots, mult by goals scored. */
export const PENALTY_SERIES_SHOTS = 5;

export function isCasinoGameId(v: string): v is CasinoGameId {
  return (CASINO_GAMES as { id: string }[]).some((g) => g.id === v);
}
