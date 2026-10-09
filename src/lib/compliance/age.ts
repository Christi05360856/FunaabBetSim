export const MIN_AGE = 18;

const HOUR_MS = 60 * 60 * 1000;
/** Africa/Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = HOUR_MS;

export type DobResult =
  | { ok: true; dob: string; age: number }
  | { ok: false; error: string };

/** Today's calendar date in Lagos. */
function lagosToday(nowMs: number): { y: number; m: number; d: number } {
  const t = new Date(nowMs + LAGOS_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * Validate a date of birth (YYYY-MM-DD) and work out the age in Lagos time.
 * Rejects impossible dates (31 Feb), future dates, and anyone under 18.
 */
export function checkDob(input: unknown, nowMs: number = Date.now()): DobResult {
  const raw = typeof input === "string" ? input.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return { ok: false, error: "Enter your date of birth as a valid date." };

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  const real =
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d;
  if (!real || y < 1900) {
    return { ok: false, error: "Enter your date of birth as a valid date." };
  }

  const today = lagosToday(nowMs);
  const inFuture =
    y > today.y ||
    (y === today.y && (mo > today.m || (mo === today.m && d > today.d)));
  if (inFuture) {
    return { ok: false, error: "Date of birth cannot be in the future." };
  }

  let age = today.y - y;
  if (today.m < mo || (today.m === mo && today.d < d)) age -= 1;

  if (age > 110) {
    return { ok: false, error: "Enter your date of birth as a valid date." };
  }
  if (age < MIN_AGE) {
    return {
      ok: false,
      error: `You must be ${MIN_AGE} or older to use this service.`,
    };
  }
  return { ok: true, dob: raw, age };
}
