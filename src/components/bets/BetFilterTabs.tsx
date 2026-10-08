"use client";

import type { BetFilter } from "./myBetsUtils";

const TABS: { id: BetFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "void", label: "Void" },
];

export function BetFilterTabs({
  active,
  counts,
  onChange,
}: {
  active: BetFilter;
  counts: Record<BetFilter, number>;
  onChange: (f: BetFilter) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition " +
              (on
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-ink-muted/10 text-ink-muted")
            }
          >
            {t.label}
            <span className={"ml-1 tabular-nums " + (on ? "opacity-90" : "opacity-60")}>
              {counts[t.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
