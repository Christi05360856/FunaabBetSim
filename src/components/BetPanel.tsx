"use client";

/**
 * Stake panel once a selection is picked.
 * Quick chips ADD to the current stake (tap 20k repeatedly) up to balance.
 */
import Link from "next/link";
import { MINIMUM_STAKE } from "@/types/domain";
import type { PickedSelection } from "@/lib/hooks/usePlaceBet";
import { useWallet } from "@/lib/hooks/useWallet";

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
  const { wallet } = useWallet();
  const balance = wallet?.balance ?? 0;
  const stakeNumber = Number(stake) || 0;
  const overBalance = stake !== "" && stakeNumber > balance;
  const stakeValid = stake !== "" && stakeNumber >= MINIMUM_STAKE && !overBalance;

  function addQuick(amount: number) {
    const current = Number(stake) || 0;
    const next = current + amount;
    if (next > balance) {
      setStake(String(balance));
      return;
    }
    setStake(String(next));
  }

  if (!user) {
    return (
      <div className="rounded-xl bg-surface-raised p-3 text-sm text-ink-muted animate-fade-in">
        <Link href="/login" className="font-medium text-brand underline">
          Log in
        </Link>{" "}
        to place a bet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-surface-raised p-3 animate-fade-in">
      <div className="flex items-center justify-between text-sm">
        <span className="min-w-0 truncate text-ink-muted">
          {homeLabel} <span className="text-ink-muted/60">vs</span> {awayLabel}
        </span>
        <span className="shrink-0 font-display font-bold text-brand">
          {picked.selection.odds.toFixed(2)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_STAKES.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => addQuick(amount)}
            className="rounded-lg bg-bg px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors active:bg-brand active:text-white"
          >
            +₦{amount.toLocaleString("en-NG")}
          </button>
        ))}
        {stakeNumber > 0 && (
          <button
            type="button"
            onClick={() => setStake("")}
            className="rounded-lg bg-bg px-2.5 py-1 text-xs font-semibold text-ink-muted"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={"Min ₦" + MINIMUM_STAKE.toLocaleString("en-NG")}
          value={stake}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "");
            setStake(digits);
          }}
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

      {overBalance && (
        <p className="text-xs font-medium text-loss">Balance not enough</p>
      )}

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
