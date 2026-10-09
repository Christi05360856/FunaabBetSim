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
  | "auth_fail"
  | "support_ticket"
  | "match_chat"
  | "match_predict";

type LimitConfig = { max: number; windowMs: number };

/**
 * Buckets that protect money or accounts FAIL CLOSED: if the limiter itself
 * errors, the request is refused instead of waved through.
 * Low-risk buckets (chat, predictions, ticket checks) fail open.
 */
const FAIL_CLOSED = new Set<RateLimitBucket>([
  "register",
  "place_bet",
  "deposit_init",
  "withdraw_request",
  "auth_fail",
]);

const LIMITS: Record<RateLimitBucket, LimitConfig> = {
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  place_bet: { max: 40, windowMs: 60 * 1000 },
  deposit_init: { max: 10, windowMs: 60 * 60 * 1000 },
  withdraw_request: { max: 8, windowMs: 24 * 60 * 60 * 1000 },
  book_code: { max: 30, windowMs: 60 * 60 * 1000 },
  verify_ticket: { max: 40, windowMs: 60 * 60 * 1000 },
  auth_fail: { max: 20, windowMs: 15 * 60 * 1000 },
  support_ticket: { max: 8, windowMs: 24 * 60 * 60 * 1000 },
  match_chat: { max: 20, windowMs: 60 * 60 * 1000 },
  match_predict: { max: 10, windowMs: 60 * 60 * 1000 },
};

function humanWait(ms: number): string {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"}`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 48) {
    if (remMin === 0) return `${hr} hour${hr === 1 ? "" : "s"}`;
    return `${hr}h ${remMin}m`;
  }
  const days = Math.ceil(hr / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function messageFor(
  bucket: RateLimitBucket,
  retryAfterMs: number
): string {
  const wait = humanWait(retryAfterMs);
  if (bucket === "withdraw_request") {
    return `Withdrawal request limit reached (8 attempts per day). Try again in about ${wait}`;
  }
  if (bucket === "deposit_init") {
    return `Too many deposit attempts. Try again in about ${wait}.`;
  }
  if (bucket === "place_bet") {
    return `You're placing bets too quickly. Wait about ${wait} and try again.`;
  }
  if (bucket === "auth_fail") {
    return `Too many failed sign-in attempts. Try again in about ${wait}.`;
  }
  if (bucket === "support_ticket") {
    return `Support request limit reached. Try again in about ${wait}.`;
  }
  if (bucket === "match_chat") {
    return `You're posting too fast in chat. Wait about ${wait}.`;
  }
  if (bucket === "match_predict") {
    return `Too many prediction attempts. Wait about ${wait}.`;
  }
  return `Too many requests. Please try again in about ${wait}.`;
}

/**
 * Firestore sliding-window counter.
 * Returns null if allowed, or a 429 NextResponse with clear retry timing.
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
    const result = await adminDb.runTransaction(async (tx) => {
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
        const retryAfterMs = Math.max(1000, windowStart + cfg.windowMs - now);
        return { blocked: true as const, retryAfterMs, windowStart, count };
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
      return { blocked: false as const, retryAfterMs: 0, windowStart, count };
    });

    if (result.blocked) {
      const retrySec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      return NextResponse.json(
        {
          error: messageFor(bucket, result.retryAfterMs),
          bucket,
          retryAfterSeconds: retrySec,
          retryAfterMs: result.retryAfterMs,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retrySec) },
        }
      );
    }
    return null;
  } catch (err) {
    console.error("rateLimit error", bucket, err);
    if (FAIL_CLOSED.has(bucket)) {
      return NextResponse.json(
        { error: "Security check is temporarily unavailable. Please try again in a moment." },
        { status: 503, headers: { "Retry-After": "10" } }
      );
    }
    return null;
  }
}

export { clientIp } from "@/lib/security/clientIp";
