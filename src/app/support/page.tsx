"use client";

import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Support</h1>
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card text-sm">
        <p className="text-ink-muted">
          Need help with deposits, withdrawals, or bets? Reach us through:
        </p>
        <ul className="space-y-2">
          <li>
            <span className="font-semibold">Email:</span>{" "}
            <a
              href="mailto:support@funaabbetsim.com"
              className="text-brand underline"
            >
              support@funaabbetsim.com
            </a>
          </li>
          <li>
            <span className="font-semibold">WhatsApp:</span>{" "}
            <span className="text-ink-muted">Coming soon</span>
          </li>
          <li>
            <span className="font-semibold">Hours:</span> Mon–Sat, 9:00–18:00
            WAT
          </li>
        </ul>
        <p className="text-[11px] text-ink-muted pt-2">
          Placeholder contacts — update these when your support channel is live.
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <p className="text-xs font-semibold uppercase text-ink-muted mb-2">
          Partners
        </p>
        <p className="text-sm text-ink-muted">
          Official partners and sponsors will appear here. Admins can add brand
          logos later from the admin panel.
        </p>
      </div>
    </main>
  );
}
