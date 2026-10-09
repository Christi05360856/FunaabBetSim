/**
 * Best-effort client IP.
 * On Vercel the platform sets (and overwrites) these headers, so callers
 * cannot forge them. Order: Vercel's own header, then x-real-ip, then the
 * first x-forwarded-for hop.
 * If you ever host somewhere else, make sure your proxy overwrites them.
 */
export function clientIp(request: { headers: Headers }): string {
  const h = request.headers;

  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = h.get("x-real-ip")?.trim();
  if (real) return real;

  const xf = h.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}
