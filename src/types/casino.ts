/**
 * Casino demo types — isolated from sports Wallet / ledger.
 * Chips are never withdrawable and never mix with purchased/promo.
 */

export const CASINO_START_CHIPS = 10_000;
export const CASINO_RELOAD_CHIPS = 5_000;
/** Cooldown after a successful zero-balance reload. */
export const CASINO_RELOAD_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export type CasinoGameId = "dice" | "coin" | "mines" | "wheel" | "crash";

export interface CasinoGameMeta {
  id: CasinoGameId;
  name: string;
  blurb: string;
  /** Phase A: only lobby; play ships in later phases */
  playReady: boolean;
}

export const CASINO_GAMES: CasinoGameMeta[] = [
  { id: "dice", name: "Dice", blurb: "Roll over / under a target", playReady: false },
  { id: "coin", name: "Coin Flip", blurb: "Heads or tails", playReady: false },
  { id: "mines", name: "Mines", blurb: "Clear tiles, avoid bombs", playReady: false },
  { id: "wheel", name: "Wheel", blurb: "Spin for a multiplier", playReady: false },
  { id: "crash", name: "Crash Lite", blurb: "Cash out before it crashes", playReady: false },
];

/** Firestore: casino_wallets/{uid} — separate from wallets/{uid} */
export interface CasinoDemoWallet {
  uid: string;
  /** Demo chips only */
  balance: number;
  /** First time 10k was granted */
  startedAt: number;
  /** Last successful reload (5k after zero); null if never reloaded */
  lastReloadAt: number | null;
  updatedAt: number;
}

export function isCasinoGameId(v: string): v is CasinoGameId {
  return (CASINO_GAMES as { id: string }[]).some((g) => g.id === v);
}
