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

export type CasinoGameId = "dice" | "coin" | "mines" | "wheel" | "crash";

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

export const MINES_GRID = 25; // 5×5
export const MINES_MIN = 1;
export const MINES_MAX = 10;

/** Wheel multipliers (including zeros). Index = segment. */
export const WHEEL_SEGMENTS = [0, 0.5, 1.1, 1.5, 2, 3, 5, 0, 1.2, 1.5, 2, 10] as const;

export function isCasinoGameId(v: string): v is CasinoGameId {
  return (CASINO_GAMES as { id: string }[]).some((g) => g.id === v);
}
