"use client";

import Link from "next/link";

type Props = {
  title: string;
  href?: string;
  hrefLabel?: string;
  accent?: "live" | "default";
};

export function SectionHeader({
  title,
  href,
  hrefLabel = "See all",
  accent = "default",
}: Props) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {accent === "live" && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
        <h2
          className={`text-xs font-bold uppercase tracking-wide ${
            accent === "live" ? "text-red-600" : "text-ink-muted"
          }`}
        >
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="text-[11px] font-semibold text-brand hover:underline"
        >
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}
