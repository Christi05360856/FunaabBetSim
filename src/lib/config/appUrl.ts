const FALLBACK = "https://funaab-betsim.vercel.app";

/**
 * Public site URL used for payment redirects.
 * Comes from configuration only, never from a request header an attacker
 * could set. Set APP_URL in Vercel for every environment.
 */
export function appBaseUrl(): string {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || FALLBACK;
  return raw.trim().replace(/\/+$/, "");
}
