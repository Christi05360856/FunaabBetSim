"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function chips(n: number) {
  return Math.floor(n).toLocaleString("en-NG");
}

type Props = {
  title: string;
  balance: number | null;
  children: ReactNode;
  footer?: ReactNode;
};

/** Shared casino page chrome — back, title, demo balance only. */
export function CasinoShell({ title, balance, children, footer }: Props) {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-bg px-4 pb-28 pt-3 text-ink">
      <header className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/casino"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-muted/15 bg-surface text-ink"
          aria-label="Back to casino"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-base font-bold tracking-tight">{title}</h1>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Play for free
          </p>
        </div>
        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Chips
          </p>
          <p className="text-sm font-bold tabular-nums text-ink">
            {balance == null ? "—" : chips(balance)}
          </p>
        </div>
      </header>
      {children}
      {footer}
    </main>
  );
}

type StakeProps = {
  stake: number;
  setStake: (n: number) => void;
  balance: number | null;
  min: number;
  max: number;
  potentialLabel?: string;
};

export function StakeBar({ stake, setStake, balance, min, max, potentialLabel }: StakeProps) {
  const half = () => setStake(Math.max(min, Math.floor(stake / 2)));
  const dbl = () =>
    setStake(Math.min(max, balance ?? max, Math.floor(stake * 2) || min));
  const mx = () => setStake(Math.min(max, balance ?? max));

  return (
    <div className="rounded-2xl border border-ink-muted/15 bg-surface p-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-ink-muted">Stake</label>
        {potentialLabel && (
          <span className="text-[11px] text-ink-muted">{potentialLabel}</span>
        )}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={stake}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          setStake(Math.min(max, Math.max(0, Math.floor(v))));
        }}
        className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-transparent px-3 py-2.5 text-lg font-bold tabular-nums text-ink outline-none focus:border-brand"
      />
      <div className="mt-2 flex gap-2">
        {[
          { label: "½", fn: half },
          { label: "2×", fn: dbl },
          { label: "Max", fn: mx },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.fn}
            className="flex-1 rounded-lg bg-ink-muted/10 py-1.5 text-xs font-bold text-ink active:scale-[0.98]"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResultBanner({
  won,
  text,
}: {
  won: boolean | null;
  text: string | null;
}) {
  if (!text) return null;
  return (
    <div
      className={`mb-3 rounded-2xl px-4 py-3 text-center text-sm font-bold ${
        won === true
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : won === false
            ? "bg-red-500/15 text-red-700 dark:text-red-300"
            : "bg-ink-muted/10 text-ink"
      }`}
    >
      {text}
    </div>
  );
}

export function PrimaryBtn({
  busy,
  disabled,
  label,
  busyLabel,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  busyLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="mt-4 w-full rounded-2xl bg-brand py-3.5 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-45"
    >
      {busy ? busyLabel : label}
    </button>
  );
}
