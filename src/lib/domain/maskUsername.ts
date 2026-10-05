/** Public chat label: first 3 + **** + last 3 (or shorter safe form). */
export function maskUsername(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .replace(/@.*$/, "") // strip email domain if passed full email
    .replace(/\s+/g, "");
  if (s.length <= 2) return "fan***";
  if (s.length <= 6) return s.slice(0, 2) + "****" + s.slice(-1);
  return s.slice(0, 3) + "****" + s.slice(-3);
}
