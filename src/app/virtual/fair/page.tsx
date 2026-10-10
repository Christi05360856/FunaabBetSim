"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type FairData = {
  today?: string;
  todayCommitment?: string;
  yesterday?: string;
  yesterdaySeed?: string;
  yesterdayCommitment?: string;
  yesterdaySeedCheck?: string;
  currentRoundIndex?: number;
  note?: string;
};

export default function VirtualFairPage() {
  const [data, setData] = useState<FairData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/virtual/fair")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setErr("Could not load"));
  }, []);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg px-4 pb-28 pt-4 text-ink">
      <Link href="/virtual" className="text-sm font-semibold text-brand">
        ← Instant Football
      </Link>
      <h1 className="mt-3 text-xl font-extrabold">Provably fair</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Every shared virtual round is generated from a secret day seed. We
        publish a hash of that seed in advance. After the day ends, the seed is
        revealed so anyone can verify results were not changed.
      </p>

      {err && (
        <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>
      )}

      {data && (
        <div className="mt-5 space-y-4">
          <section className="rounded-2xl border border-ink-muted/12 bg-surface p-4">
            <p className="text-[10px] font-bold uppercase text-ink-muted">
              Today · {data.today}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-ink">
              {data.todayCommitment}
            </p>
            <p className="mt-2 text-[11px] text-ink-muted">
              Commitment = sha256(daySeed). Seed stays secret until tomorrow.
            </p>
          </section>

          <section className="rounded-2xl border border-ink-muted/12 bg-surface p-4">
            <p className="text-[10px] font-bold uppercase text-ink-muted">
              Yesterday · {data.yesterday} · revealed
            </p>
            <p className="mt-2 text-[11px] font-semibold text-ink-muted">Seed</p>
            <p className="break-all font-mono text-[11px]">{data.yesterdaySeed}</p>
            <p className="mt-2 text-[11px] font-semibold text-ink-muted">
              sha256(seed) check
            </p>
            <p className="break-all font-mono text-[11px]">
              {data.yesterdaySeedCheck}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">
              Must equal commitment: {data.yesterdayCommitment}
            </p>
          </section>

          <p className="text-[11px] text-ink-muted">
            Round seed = sha256(daySeed + &quot;:round:&quot; + index). Current
            round index: {data.currentRoundIndex}
          </p>
          {data.note && (
            <p className="text-[11px] text-ink-muted">{data.note}</p>
          )}
        </div>
      )}
    </main>
  );
}
