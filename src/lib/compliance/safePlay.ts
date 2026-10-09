/**
 * Responsible-gambling rules: deposit limits and self-exclusion.
 * Pure functions (no database) so every rule is unit tested.
 *
 * Industry-standard behaviour:
 *  - Lowering a limit (or setting one) takes effect immediately.
 *  - Raising or removing a limit only takes effect after a cooling-off delay.
 *  - A break (self-exclusion) can be extended but never shortened.
 */

export type LimitPeriod = "daily" | "weekly" | "monthly";
export const LIMIT_PERIODS: LimitPeriod[] = ["daily", "weekly", "monthly"];

export const LIMIT_INCREASE_DELAY_MS = 24 * 60 * 60 * 1000;
export const EXCLUSION_OPTIONS_DAYS = [1, 7, 30, 90, 180] as const;
export const MIN_LIMIT_NGN = 200;
export const MAX_LIMIT_NGN = 5_000_000;

export type LimitSetting = {
  value: number | null;
  pending?: { value: number | null; effectiveAt: number } | null;
};

export type SafePlayState = {
  limits?: Partial<Record<LimitPeriod, LimitSetting>>;
  exclusionUntil?: number | null;
  exclusionStartedAt?: number | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Africa/Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = HOUR_MS;

/** The limit in force right now (a pending change counts once its time has come). */
export function resolveLimit(
  setting: LimitSetting | undefined,
  now: number
): number | null {
  if (!setting) return null;
  if (setting.pending && now >= setting.pending.effectiveAt) {
    return setting.pending.value;
  }
  return setting.value ?? null;
}

export function requestLimitChange(
  setting: LimitSetting | undefined,
  requested: number | null,
  now: number
): LimitSetting {
  const current = resolveLimit(setting, now);
  if (requested === current) return { value: current, pending: null };

  const isStricter =
    requested !== null && (current === null || requested < current);
  if (isStricter) return { value: requested, pending: null };

  return {
    value: current,
    pending: { value: requested, effectiveAt: now + LIMIT_INCREASE_DELAY_MS },
  };
}

/** Start of the current Lagos day / week (Monday) / month, in UTC ms. */
export function limitWindowStart(period: LimitPeriod, now: number): number {
  const local = now + LAGOS_OFFSET_MS;
  const dayStartLocal = local - (((local % DAY_MS) + DAY_MS) % DAY_MS);

  if (period === "daily") return dayStartLocal - LAGOS_OFFSET_MS;

  if (period === "weekly") {
    const dayIndex = Math.floor(dayStartLocal / DAY_MS);
    const weekday = (((dayIndex + 4) % 7) + 7) % 7; // 0 = Sunday (1 Jan 1970 was a Thursday)
    const sinceMonday = (weekday + 6) % 7;
    return dayStartLocal - sinceMonday * DAY_MS - LAGOS_OFFSET_MS;
  }

  const d = new Date(local);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - LAGOS_OFFSET_MS;
}

export function isExcluded(state: SafePlayState, now: number): boolean {
  return Number(state.exclusionUntil ?? 0) > now;
}

export function startExclusion(
  state: SafePlayState,
  days: number,
  now: number
): SafePlayState {
  const existing = Number(state.exclusionUntil ?? 0);
  const until = Math.max(existing, now + days * DAY_MS);
  const stillRunning = existing > now;
  return {
    ...state,
    exclusionUntil: until,
    exclusionStartedAt: stillRunning
      ? state.exclusionStartedAt ?? now
      : now,
  };
}

const PERIOD_LABEL: Record<LimitPeriod, string> = {
  daily: "today",
  weekly: "this week",
  monthly: "this month",
};

export type DepositRecord = { amount: number; createdAt: number };

/** Returns an error message if this deposit would break a limit, else null. */
export function checkDepositAgainstLimits(
  state: SafePlayState,
  deposits: DepositRecord[],
  amount: number,
  now: number
): string | null {
  for (const period of LIMIT_PERIODS) {
    const limit = resolveLimit(state.limits?.[period], now);
    if (limit === null) continue;
    const start = limitWindowStart(period, now);
    const used = deposits
      .filter((d) => d.createdAt >= start)
      .reduce((sum, d) => sum + d.amount, 0);
    if (used + amount > limit) {
      const room = Math.max(0, limit - used);
      return `Your ${period} deposit limit of ₦${limit} would be exceeded. You can deposit up to ₦${room} more ${PERIOD_LABEL[period]}.`;
    }
  }
  return null;
}
