"use client";

import { useState } from "react";
import type { Team } from "@/types/domain";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 52,
};

function monogram(team?: Pick<Team, "name" | "shortName"> | null): string {
  if (!team) return "?";
  const short = (team.shortName || "").trim();
  if (short.length >= 2 && short.length <= 4) return short.slice(0, 3).toUpperCase();
  const parts = (team.name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (team.name || "?").slice(0, 2).toUpperCase();
}

/**
 * Team crest with safe fallback monogram.
 * logoUrl comes from football-data on external sync; FUNAAB teams use initials.
 */
export default function TeamCrest({
  team,
  size = "sm",
  className = "",
  light = false,
}: {
  team?: Pick<Team, "name" | "shortName" | "logoUrl"> | null;
  size?: Size;
  className?: string;
  /** On green/dark headers: white-tint monogram */
  light?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const px = SIZE_PX[size];
  const src = team?.logoUrl?.trim();
  const showImg = Boolean(src) && !broken;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={
          "shrink-0 rounded-full bg-white object-contain " +
          className
        }
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase tabular-nums " +
        (light
          ? "bg-white/20 text-white"
          : "bg-brand/15 text-brand") +
        " " +
        className
      }
      style={{
        width: px,
        height: px,
        fontSize: Math.max(9, Math.round(px * 0.32)),
      }}
      aria-hidden
    >
      {monogram(team)}
    </span>
  );
}
