import "server-only";
import { createHmac } from "crypto";

/**
 * We never store a raw NIN. We keep the last 4 digits (for support) and a
 * keyed one-way fingerprint (to spot the same NIN on two accounts).
 * Set PII_HASH_KEY (32+ random characters) in your hosting environment.
 */
export function ninLast4(nin: string): string {
  return nin.slice(-4);
}

export function hashNin(nin: string): string | null {
  const key = process.env.PII_HASH_KEY?.trim();
  if (!key) return null;
  return createHmac("sha256", key).update(`nin:${nin}`).digest("hex");
}
