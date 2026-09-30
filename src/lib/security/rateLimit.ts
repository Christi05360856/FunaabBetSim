import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

export type RateLimitBucket =
  | "register"
  | "place_bet"
  | "deposit_init"
  | "withdraw_request"
  | "book_code"
  | "verify_ticket"
  | "auth_fail";

type LimitConfig = { max: number; windowMs: number };

const LIMITS: Record<RateLimitBucket, LimitConfig> = {
  register: { max: 5, windowMs: 60 * 60 * 1000 }, // 5 / hour per key
  place_bet: { max: 40, windowMs: 60 * 1000 }, // 40 / min
  deposit_init: { max: 10, windowMs: 60 * 60 * 1000 }, // 10 / hour
  withdraw_request: { max: 8, windowMs: 24 * 60 * 60 * 1000 }, // 8 / day
  book_code: { max: 30, windowMs: 60 * 60 * 1000 }, // 30 / hour
  verify_ticket: { max: 40, windowMs: 60 * 60 * 1000 }, // 40 / hour
  auth_fail: { max: 20, windowMs: 15 * 60 * 1000 }, // 20 / 15 min
};

/**
 * Firestore sliding-window counter (works on Vercel without Redis).
 * key should include uid and/or IP, e.g. `uid:abc` or `ip:1.2.3.4`.
 * Returns null if allowed, or a 429 NextResponse if blocked.
 */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
  key: string
): Promise<NextResponse | null> {
  const cfg = LIMITS[bucket];
  const safeKey = String(key || "unknown")
    .replace(/[^\w.:-]/g, "_")
    .slice(0, 120);
  const docId = `${bucket}:${safeKey}`;
  const ref = adminDb.collection("rate_limits").doc(docId);
  const now = Date.now();

  try {
    const blocked = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let count = 0;
      let windowStart = now;

      if (snap.exists) {
        const d = snap.data() as { count?: number; windowStart?: number };
        windowStart = Number(d.windowStart) || now;
        count = Number(d.count) || 0;
        if (now - windowStart >= cfg.windowMs) {
          count = 0;
          windowStart = now;
        }
      }

      if (count >= cfg.max) {
        return true;
      }

      tx.set(
        ref,
        {
          bucket,
          key: safeKey,
          count: count + 1,
          windowStart,
          updatedAt: now,
          max: cfg.max,
          windowMs: cfg.windowMs,
        },
        { merge: true }
      );
      return false;
    });

    if (blocked) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait and try again.",
          bucket,
        },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        }
      );
    }
    return null;
  } catch (err) {
    // Fail open on rate-limit infra errors so money paths still work
    console.error("rateLimit error", bucket, err);
    return null;
  }
}

export function clientIp(request: { headers: Headers }): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
