"use client";

/** Small league flag: England cross drawn as SVG, others as emoji. */
export default function LeagueFlag({
  league,
  size = 26,
}: {
  league: string;
  size?: number;
}) {
  if (league === "england") {
    return (
      <svg width={size} height={size * 0.72} viewBox="0 0 30 22" aria-hidden>
        <rect width="30" height="22" fill="#fff" />
        <rect x="12.5" width="5" height="22" fill="#d4202c" />
        <rect y="8.5" width="30" height="5" fill="#d4202c" />
      </svg>
    );
  }
  const emoji: Record<string, string> = {
    spain: "🇪🇸",
    germany: "🇩🇪",
    italy: "🇮🇹",
    champions: "🏆",
  };
  return (
    <span style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>
      {emoji[league] ?? "⚽"}
    </span>
  );
}
