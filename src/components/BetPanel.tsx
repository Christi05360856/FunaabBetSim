"use client";

/**
 * The stake-entry panel shown once a selection is picked — identical on the
 * Fixtures list (inline, under the card) and the match detail page (inline,
 * under the odds). All behavior lives in usePlaceBet(); this is pure markup.
 */
import Link from "next/link";
import { MINIMUM_STAKE } from "@/types/domain";
import type { PickedSelection } from "@/lib/hooks/usePlaceBet";

const QUICK_STAKES = [1_000, 5_000, 20_000];

export function BetPanel({
  picked,
  homeLabel,
  awayLabel,
  user,
  stake,
  setStake,
  submitting,
  onConfirm,
}: {
  picked: PickedSelection;
  homeLabel: string;
  awayLabel: string;
  user: unknown;
  stake: string;
  setStake: (v: string) => void;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const stakeNumber = Number(stake);
  const stakeValid = stake !== "" && stakeNumber >= MINIMUM_STAKE;

  if (!user) {
    return (
      <div className="rounded-xl bg-surface-raised p-3 text-sm text-ink-muted animate-fade-in">
        <Link href="/login" className="font-medium text-brand underline">Log in</Link> to place a bet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-surface-raised p-3 animate-fade-in">
      <div className="flex items-center justify-between text-sm">
        <span className="min-w-0 truncate text-ink-muted">
          {homeLabel} <span className="text-ink-muted/60">vs</span> {awayLabel}
        </span>
        <span className="shrink-0 font-display font-bold text-brand">{picked.selection.odds.toFixed(2)}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_STAKES.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setStake(String(amount))}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              stake === String(amount) ? "bg-brand text-white" : "bg-bg text-ink-muted"
            }`}
          >
            ₦{amount.toLocaleString("en-NG")}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={MINIMUM_STAKE}
          placeholder={`Min ₦${MINIMUM_STAKE.toLocaleString("en-NG")}`}
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-ink-muted/25 bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onConfirm}
          disabled={!stakeValid || submitting}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Placing…" : "Place bet"}
        </button>
      </div>

      {stakeValid && (
        <p className="text-xs text-ink-muted">
          Potential payout:{" "}
          <span className="font-semibold text-ink">
            ₦{Math.round(stakeNumber * picked.selection.odds).toLocaleString("en-NG")}
          </span>
        </p>
      )}
    </div>
  );
}
