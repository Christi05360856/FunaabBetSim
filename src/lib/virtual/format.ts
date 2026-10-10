/** Shared formatting for the Instant Virtual screens. */

/** Label shown before the balance (matches the reference app). */
export const CURRENCY_LABEL = "NGN";

/** 1,250.50 style amount with 2 decimals. */
export function money(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "NGN 5.60" */
export function balanceText(n: number | null | undefined): string {
  return `${CURRENCY_LABEL} ${money(n)}`;
}

/** Short 6-digit ticket number derived from the bet id. */
export function ticketNumber(betId: string | undefined, fallback: string): string {
  const src = betId || fallback;
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  return String(100000 + (h % 900000));
}

export function fmtMs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
 
