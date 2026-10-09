function tokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * True when two names clearly refer to the same person: at least two name
 * parts in common (or every part, for a short name). Order and middle names
 * are ignored, so "ADE JOHN OLU" matches "John Ade".
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (ta.length === 0 || tb.size === 0) return false;
  const common = ta.filter((t) => tb.has(t)).length;
  const need = Math.min(2, ta.length, tb.size);
  return common >= need;
}
