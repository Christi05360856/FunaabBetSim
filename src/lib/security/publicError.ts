/**
 * Never leak stack traces, database errors or provider messages in production.
 * Pure (no framework imports) so it can be unit tested.
 */
export function isProd(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

const INTERNAL_PATTERNS: RegExp[] = [
  /firebase/i,
  /firestore/i,
  /grpc/i,
  /^\d+\s+[A-Z_]+:/, // gRPC style: "9 FAILED_PRECONDITION: ..."
  /requires an index/i,
  /projects\//i,
  /ECONN|ETIMEDOUT|ENOTFOUND/i,
  /\bat\s.+\(.+:\d+:\d+\)/, // stack frame
  /secret|api[_ ]?key|token/i,
];

export function publicErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (!isProd() && err instanceof Error && err.message) {
    return err.message;
  }
  if (err instanceof Error) {
    const m = err.message;
    const safe =
      m.length > 0 &&
      m.length <= 180 &&
      !m.includes("\n") &&
      !INTERNAL_PATTERNS.some((re) => re.test(m));
    if (safe) return m;
  }
  return fallback;
}
