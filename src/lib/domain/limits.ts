/**
 * Bet risk limits and the ONE payout rounding rule.
 * Pure (no database), so it is unit tested. Limits can be tuned with env vars
 * without a code change.
 */

function envNumber(name: string, fallback: number, allowZero = false): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0 || (n === 0 && !allowZero)) return fallback;
  return n;
}

export function betLimits() {
  return {
    /** Largest single stake, in points (1 pt = ₦1). */
    maxStake: envNumber("BET_MAX_STAKE", 50_000),
    /** Most a single ticket can ever pay out ("max win"). */
    maxPayout: envNumber("BET_MAX_PAYOUT", 1_000_000),
    /** Most selections on one ticket (schema also caps at 15). */
    maxLegs: envNumber("BET_MAX_LEGS", 15),
    /** Highest combined odds accepted on one ticket. */
    maxCombinedOdds: envNumber("BET_MAX_COMBINED_ODDS", 2_000),
    /** Deposits must be wagered this many times before withdrawal. 0 turns it off. */
    turnoverMultiplier: envNumber("TURNOVER_MULTIPLIER", 1, true),
  };
}

/**
 * Gross payout for a stake at the given odds, rounded DOWN to whole points.
 * The tiny epsilon stops float noise (100 x 1.15 = 114.99999999999999) from
 * costing the player a point.
 */
export function computePayout(stake: number, odds: number): number {
  if (!Number.isFinite(stake) || !Number.isFinite(odds) || stake <= 0 || odds <= 0) {
    return 0;
  }
  return Math.floor(stake * odds + 1e-9);
}

/**
 * What the wallet is actually credited on a win:
 *  - gross payout, minus the promo part of the stake (free-bet "stake not
 *    returned": only the winnings on promo points are paid), capped at max win.
 */
export function computeCredit(
  stake: number,
  odds: number,
  fromPromo = 0,
  cap: number = betLimits().maxPayout
): number {
  const gross = computePayout(stake, odds);
  const credit = Math.max(0, gross - Math.max(0, fromPromo));
  return Math.min(cap, credit);
}

export function checkBetLimits(input: {
  stake: number;
  legCount: number;
  combinedOdds: number;
}): string | null {
  const lim = betLimits();
  if (input.stake > lim.maxStake) {
    return `Maximum stake per bet is ₦${lim.maxStake}.`;
  }
  if (input.legCount > lim.maxLegs) {
    return `Unable to bet. Maximum ${lim.maxLegs} selections per ticket. Remove some selections.`;
  }
  if (input.combinedOdds > lim.maxCombinedOdds) {
    return `Unable to bet. Odds are above ${lim.maxCombinedOdds}. Remove some selections.`;
  }
  return null;
}
