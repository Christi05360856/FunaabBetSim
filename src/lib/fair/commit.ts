import "server-only";
import { createHash, createHmac } from "crypto";

/** Server secret for virtual + casino fairness. Set VIRTUAL_FAIR_SECRET in env. */
export function fairSecret(): string {
  const s = process.env.VIRTUAL_FAIR_SECRET?.trim();
  if (s && s.length >= 16) return s;
  // Dev fallback — production MUST set VIRTUAL_FAIR_SECRET
  return process.env.CRON_SECRET?.trim() || "funaab-dev-fair-secret-change-me";
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacHex(key: string, msg: string): string {
  return createHmac("sha256", key).update(msg, "utf8").digest("hex");
}

/** Lagos calendar day YYYY-MM-DD */
export function lagosDayKey(ms = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Secret day seed (never expose until reveal window). */
export function daySeed(dayKey: string, secret = fairSecret()): string {
  return hmacHex(secret, `day:${dayKey}`);
}

/** Public commitment published in advance. */
export function dayCommitment(dayKey: string, secret = fairSecret()): string {
  return sha256Hex(daySeed(dayKey, secret));
}

/** Per-round seed derived from day seed. */
export function roundSeed(dayKey: string, roundIndex: number, secret = fairSecret()): string {
  return sha256Hex(`${daySeed(dayKey, secret)}:round:${roundIndex}`);
}

/**
 * Deterministic PRNG from hex seed (xorshift32-ish over sha stream).
 * Returns unit float in [0,1).
 */
export function makePrng(seedHex: string): () => number {
  let counter = 0;
  let buf: number[] = [];
  const fill = () => {
    const h = sha256Hex(`${seedHex}:${counter++}`);
    buf = [];
    for (let i = 0; i < 32; i += 4) {
      buf.push(parseInt(h.slice(i, i + 8), 16) >>> 0);
    }
  };
  fill();
  let i = 0;
  return () => {
    if (i >= buf.length) {
      fill();
      i = 0;
    }
    const n = buf[i++]!;
    return n / 0x1_0000_0000;
  };
}

/** Casino game seed: day + game + round/session id */
export function gameSeed(
  game: string,
  id: string,
  dayKey = lagosDayKey(),
  secret = fairSecret()
): string {
  return sha256Hex(`${daySeed(dayKey, secret)}:game:${game}:${id}`);
}
