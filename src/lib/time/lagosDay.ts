const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Africa/Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = HOUR_MS;

/** Start (00:00 Lagos time) of the Lagos day containing `nowMs`, in UTC ms. */
export function startOfLagosDayMs(nowMs: number = Date.now()): number {
  const local = nowMs + LAGOS_OFFSET_MS;
  const intoDay = ((local % DAY_MS) + DAY_MS) % DAY_MS;
  return local - intoDay - LAGOS_OFFSET_MS;
}
