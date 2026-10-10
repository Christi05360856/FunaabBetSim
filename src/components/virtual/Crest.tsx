"use client";

/** Generated team badge (not a real club logo): shield in the team colours. */
import { teamColors } from "@/lib/virtual/teamPool";

const SHIELD = "M20 1.5 37 6v15c0 11-7.5 19.5-17 22.5C10.5 40.5 3 32 3 21V6z";

export default function Crest({
  team,
  size = 36,
}: {
  team: string;
  size?: number;
}) {
  const { primary, secondary } = teamColors(team);
  const id = `cr-${team.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 40 45"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <clipPath id={id}>
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="45" fill={primary} />
        <rect x="0" y="0" width="13" height="45" fill={secondary} opacity="0.9" />
        <rect x="27" y="0" width="13" height="45" fill={secondary} opacity="0.9" />
        <circle
          cx="20"
          cy="22"
          r="7.5"
          fill={primary}
          stroke={secondary}
          strokeWidth="2"
        />
      </g>
      <path d={SHIELD} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.6" />
    </svg>
  );
}
