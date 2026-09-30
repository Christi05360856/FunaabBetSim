"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Sponsor = {
  id: string;
  name: string;
  logoUrl?: string | null;
  linkUrl?: string | null;
};

export default function SupportPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    void fetch("/api/sponsors")
      .then((r) => r.json())
      .then((b) => {
        if (Array.isArray(b.items)) setSponsors(b.items);
      })
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Support</h1>
      </div>

      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-card text-sm">
        <p className="text-ink-muted">Need help with deposits, withdrawals, or bets?</p>
        <p>
          <span className="font-semibold">WhatsApp / phone:</span>{" "}
          <span className="text-ink-muted">Coming soon</span>
        </p>
        <p>
          <span className="font-semibold">Hours:</span> Mon–Sat, 9:00–18:00 WAT
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">
          Official partners & sponsors
        </p>
        {sponsors.length === 0 ? (
          <p className="text-sm text-ink-muted">Coming soon.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {sponsors.map((s) => (
              <li key={s.id} className="flex flex-col items-center gap-1">
                {s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.logoUrl}
                    alt={s.name}
                    className="h-12 w-12 rounded-lg object-contain bg-bg"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg text-xs font-bold">
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {s.linkUrl ? (
                  <a
                    href={s.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-brand"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span className="text-[11px] text-ink-muted">{s.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
