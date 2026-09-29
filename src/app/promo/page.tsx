"use client";

import Link from "next/link";
import {
  WELCOME_BONUS_POINTS,
  WELCOME_MAX_REDEMPTIONS,
  WELCOME_PROMO_CODE,
  PROMO_REQUIRED_LEGS,
  PROMO_MIN_LEG_ODDS,
  MIN_DEPOSIT_NGN,
} from "@/types/domain";

export default function PromoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pb-28 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Promotions</h1>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-brand to-emerald-800 p-5 text-white shadow-card">
        <p className="text-xs font-medium text-white/70">Welcome offer</p>
        <p className="mt-1 font-display text-2xl font-bold">
          +{WELCOME_BONUS_POINTS} promo points
        </p>
        <p className="mt-2 text-sm text-white/80">
          Code <span className="font-mono font-bold">{WELCOME_PROMO_CODE}</span>
        </p>
        <p className="mt-1 text-[11px] text-white/60">
          Limited to {WELCOME_MAX_REDEMPTIONS} users total
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card text-sm leading-relaxed">
        <h2 className="mb-2 font-semibold">How to claim</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-ink-muted">
          <li>Go to Buy points</li>
          <li>Enter at least ₦{MIN_DEPOSIT_NGN}</li>
          <li>
            Enter promo code <strong>{WELCOME_PROMO_CODE}</strong>
          </li>
          <li>Complete payment — bonus is added as promo points</li>
        </ol>
      </div>

      <div className="rounded-2xl bg-surface p-4 shadow-card text-sm leading-relaxed">
        <h2 className="mb-2 font-semibold">How to use promo points</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-ink-muted">
          <li>
            Exactly <strong>{PROMO_REQUIRED_LEGS} selections</strong> (5-fold
            accumulator)
          </li>
          <li>
            <strong>1X2 only</strong> (match winner — home / draw / away)
          </li>
          <li>
            Each leg odds at least <strong>{PROMO_MIN_LEG_ODDS.toFixed(2)}</strong>
          </li>
          <li>Promo points are not withdrawable as cash</li>
          <li>One welcome bonus per account</li>
        </ul>
      </div>

      <Link
        href="/account/deposit"
        className="rounded-xl bg-brand py-3 text-center text-sm font-semibold text-white"
      >
        Buy points with promo
      </Link>
    </main>
  );
}
