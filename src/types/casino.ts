/**
 * Casino demo types — isolated from sports Wallet / ledger.
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

export const PENALTY_MULT = THIMBLES_MULT;

export const WHEEL_SEGMENTS = [0, 0.5, 1.1, 1.5, 2, 3, 5, 0, 1.2, 1.5, 2, 10] as const;

/** Plinko: 9 buckets (8 peg rows). Multipliers tuned ~1% house edge. */
export const PLINKO_SLOTS = [5.6, 2.1, 1.1, 0.7, 0.4, 0.7, 1.1, 2.1, 5.6] as const;
export const PLINKO_ROWS = 8;

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
 * Rough EV near 0.96–0.99 depending on pick size.
 */
export const KENO_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 3.6 },
  2: { 2: 14 },
  3: { 2: 2.2, 3: 45 },
  4: { 2: 1.2, 3: 6, 4: 90 },
  5: { 3: 3, 4: 18, 5: 350 },
  6: { 3: 2, 4: 8, 5: 70, 6: 1200 },
  7: { 3: 1.5, 4: 4, 5: 25, 6: 200, 7: 4000 },
  8: { 4: 3, 5: 12, 6: 80, 7: 800, 8: 8000 },
  9: { 4: 2, 5: 7, 6: 35, 7: 250, 8: 2000, 9: 10000 },
  10: { 5: 5, 6: 20, 7: 100, 8: 800, 9: 4000, 10: 10000 },
};

/** Penalty series: 5 shots, mult by goals scored. */
export const PENALTY_SERIES_SHOTS = 5;
export const PENALTY_SERIES_MULT: Record<number, number> = {
  0: 0,
  1: 0.4,
  2: 1.1,
  3: 2.4,
  4: 5.5,
  5: 14,
};

export function isCasinoGameId(v: string): v is CasinoGameId {
  return (CASINO_GAMES as { id: string }[]).some((g) => g.id === v);
  }
