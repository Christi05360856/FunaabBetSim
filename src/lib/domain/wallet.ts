import { MINIMUM_STAKE } from "@/types/domain";

/**
 * Pure, deterministic check for whether a stake could be accepted against a
 * given balance. This mirrors only the *shape* of the future server-side
 * bet-placement validation as a client-side UX pre-check — the server
 * always re-validates independently and is the only real authority.
 */
export function canPlaceStake(balance: number, stake: number): boolean {
  if (!Number.isFinite(balance) || !Number.isFinite(stake)) return false;
  if (stake < MINIMUM_STAKE) return false;
  if (stake > balance) return false;
  return true;
}
