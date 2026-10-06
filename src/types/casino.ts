/**
 * Casino demo types — isolated from sports Wallet / ledger.
 * Chips are never withdrawable and never mix with purchased/promo.
 */

export const CASINO_START_CHIPS = 10_000;
export const CASINO_RELOAD_CHIPS = 5_000;
/** Cooldown after a successful zero-balance reload. */
export const CASINO_RELOAD_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/** Min / max demo stake per round */
export const CASINO_MIN_STAKE = 10;
export const CASINO_MAX_STAKE = 5_000;

/** House edge applied to fair multiplier (~1%). */
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
  { id: "coin", name: "Coin Flip", blurb: "Heads or tails", playReady: false },
  { id: "mines", name: "Mines", blurb: "Clear tiles, avoid bombs", playReady: false },
  { id: "wheel", name: "Wheel", blurb: "Spin for a multiplier", playReady: false },
  { id: "crash", name: "Crash Lite", blurb: "Cash out before it crashes", playReady: false },
];

/** Firestore: casino_wallets/{uid} — separate from wallets/{uid} */
export interface CasinoDemoWallet {
  uid: string;
  balance: number;
  startedAt: number;
  lastReloadAt: number | null;
  updatedAt: number;
}

export type DiceDirection = "under" | "over";

export interface DicePlayRequest {
  game: "dice";
  stake: number;
  /** Target 2–98 inclusive */
  target: number;
  direction: DiceDirection;
}

export interface DicePlayResult {
  game: "dice";
  stake: number;
  target: number;
  direction: DiceDirection;
  roll: number;
  won: boolean;
  multiplier: number;
  payout: number;
  /** Net change: payout - stake (0 if lost) */
  profit: number;
  balanceAfter: number;
  playId: string;
}

export function isCasinoGameId(v: string): v is CasinoGameId {
  return (CASINO_GAMES as { id: string }[]).some((g) => g.id === v);
}

