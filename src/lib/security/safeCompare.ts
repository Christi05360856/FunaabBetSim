import "server-only";
import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for secrets (webhook hashes, cron secrets).
 * Both values are hashed first so the comparison never leaks the length, and
 * timingSafeEqual always receives equal-length buffers.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}
