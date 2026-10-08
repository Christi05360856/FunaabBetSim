"use client";

/** Client-safe review shapes (mirror server JSON). */
export type ReviewLeg = {
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string;
  odds: number;
  homeTeamName?: string;
  awayTeamName?: string;
  marketName?: string;
  previousOdds?: number;
  oddsChanged?: boolean;
  marketType?: string;
};

export type ReviewDropped = {
  index: number;
  reason: string;
  matchId?: string;
  selectionLabel?: string;
};

export function TicketRevalidateSheet({
  title,
  legs,
  totalOdds,
  dropped,
  oddsChangedCount,
  warning,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  legs: ReviewLeg[];
  totalOdds: number;
  dropped: ReviewDropped[];
  oddsChangedCount: number;
  warning?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center">
      <div
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-xl sm:rounded-3xl"
        role="dialog"
        aria-labelledby="reval-title"
      >
        <h2 id="reval-title" className="text-base font-bold text-ink">
          {title}
        </h2>

        {(warning || dropped.length > 0 || oddsChangedCount > 0) && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            {warning ||
              (dropped.length > 0
                ? dropped.length +
                  " selection(s) removed" +
                  (oddsChangedCount > 0
                    ? " · " + oddsChangedCount + " odds changed"
                    : "")
                : oddsChangedCount + " selection(s) have new odds")}
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {legs.map((leg, i) => (
            <li
              key={leg.matchId + "-" + leg.selectionId + "-" + i}
              className={
                "rounded-xl border px-3 py-2.5 " +
                (leg.oddsChanged
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-ink-muted/12 bg-bg/60")
              }
            >
              <p className="text-sm font-bold text-ink">
                {(leg.homeTeamName || "Home") +
                  " vs " +
                  (leg.awayTeamName || "Away")}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {(leg.marketName || "Market") +
                  " · " +
                  (leg.selectionLabel || leg.selectionId)}
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-ink">
                {leg.oddsChanged && leg.previousOdds != null ? (
                  <>
                    <span className="text-ink-muted line-through">
                      {Number(leg.previousOdds).toFixed(2)}
                    </span>
                    <span className="mx-1 text-amber-700">→</span>
                    <span className="text-emerald-700">
                      {Number(leg.odds).toFixed(2)}
                    </span>
                  </>
                ) : (
                  Number(leg.odds).toFixed(2)
                )}
              </p>
            </li>
          ))}
        </ul>

        {dropped.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
              Unavailable
            </p>
            <ul className="mt-1 space-y-1">
              {dropped.map((d, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-700 dark:text-rose-300"
                >
                  {d.selectionLabel
                    ? d.selectionLabel + " — " + d.reason
                    : d.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-center text-sm font-semibold tabular-nums text-ink">
          Combined odds{" "}
          <span className="text-emerald-700">{totalOdds.toFixed(2)}</span>
          <span className="text-ink-muted"> · {legs.length} leg(s)</span>
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-ink-muted/20 py-3 text-sm font-bold text-ink-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || legs.length === 0}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Add to slip"}
          </button>
        </div>
      </div>
    </div>
  );
}
