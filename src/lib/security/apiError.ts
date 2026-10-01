import { NextResponse } from "next/server";

/**
 * Phase 4 — never leak stack traces / internal messages in production.
 */
export function isProd(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function publicErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (!isProd() && err instanceof Error && err.message) {
    return err.message;
  }
  if (err instanceof Error) {
    const m = err.message;
    // Safe, user-facing messages we intentionally throw
    const allow =
      m.length <= 180 &&
      !m.includes("Firebase") &&
      !m.includes("Firestore") &&
      !m.includes("ECONN") &&
      !m.includes("at ") &&
      !m.includes("\n");
    if (allow) return m;
  }
  return fallback;
}

export function jsonError(
  err: unknown,
  status = 400,
  fallback?: string
): NextResponse {
  return NextResponse.json(
    { error: publicErrorMessage(err, fallback) },
    { status }
  );
}
