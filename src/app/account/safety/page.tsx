"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

type Period = "daily" | "weekly" | "monthly";

type LimitRow = {
  period: Period;
  value: number | null;
  used: number;
  pending: { value: number | null; effectiveAt: number } | null;
};

type SafetyState = {
  ageGateEnforced: boolean;
  ageVerified: boolean;
  ageBlocked: boolean;
  limits: LimitRow[];
  exclusion: { active: boolean; until: number | null };
  options: {
    exclusionDays: number[];
    limitIncreaseDelayHours: number;
    minLimit: number;
    maxLimit: number;
  };
};

const PERIOD_LABEL: Record<Period, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function naira(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const inputClass =
  "w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function SafetyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<SafetyState | null>(null);
  const [dob, setDob] = useState("");
  const [limitInputs, setLimitInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/safety", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setState((await res.json()) as SafetyState);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(payload: Record<string, unknown>): Promise<boolean> {
    if (!user) return false;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/safety", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setMessage(data.message || "Saved.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmAge(e: FormEvent) {
    e.preventDefault();
    if (!dob) {
      setError("Choose your date of birth.");
      return;
    }
    const ok = await send({ action: "confirm_age", dob });
    if (ok) setMessage("Age confirmed. Thank you.");
  }

  async function saveLimit(period: Period) {
    const raw = (limitInputs[period] ?? "").trim();
    if (!raw) {
      setError("Enter an amount, or use Remove limit.");
      return;
    }
    await send({ action: "set_limit", period, value: Number(raw) });
    setLimitInputs((prev) => ({ ...prev, [period]: "" }));
  }

  async function removeLimit(period: Period) {
    await send({ action: "set_limit", period, value: null });
  }

  async function takeBreak(days: number) {
    const label = days === 1 ? "24 hours" : `${days} days`;
    const sure = window.confirm(
      `Pause betting and deposits for ${label}? You cannot end a break early. You can still withdraw.`
    );
    if (!sure) return;
    await send({ action: "exclude", days });
  }

  if (loading || !user || !state) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-sm text-ink-muted">
        Loading…
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/account/settings" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="font-display text-lg font-bold">Safer play</h1>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-3 rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand" role="status">
          {message}
        </p>
      )}

      <section className="mb-4 rounded-2xl bg-surface p-4 shadow-card">
        <h2 className="text-sm font-bold">Age check (18+)</h2>
        {state.ageVerified ? (
          <p className="mt-2 text-sm text-brand">✓ Your age is confirmed.</p>
        ) : state.ageBlocked ? (
          <p className="mt-2 text-sm text-loss">
            We could not confirm your age. Please contact support.
          </p>
        ) : (
          <form onSubmit={onConfirmAge} className="mt-2 space-y-3">
            <p className="text-sm text-ink-muted">
              You must be 18 or older. Enter your real date of birth. It cannot
              be changed later.
            </p>
            <label className="block text-sm font-medium">
              Date of birth
              <input
                type="date"
                className={`mt-1 ${inputClass}`}
                value={dob}
                max={today}
                onChange={(e) => setDob(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Checking…" : "Confirm my age"}
            </button>
          </form>
        )}
      </section>

      <section className="mb-4 rounded-2xl bg-surface p-4 shadow-card">
        <h2 className="text-sm font-bold">Deposit limits</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Lower a limit and it applies straight away. Raising or removing one
          takes {state.options.limitIncreaseDelayHours} hours, so you have time
          to think.
        </p>
        <div className="mt-3 space-y-4">
          {state.limits.map((row) => (
            <div key={row.period} className="rounded-xl border border-ink-muted/15 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{PERIOD_LABEL[row.period]}</span>
                <span className="text-ink-muted">
                  {row.value === null ? "No limit" : naira(row.value)}
                </span>
              </div>
              {row.value !== null && (
                <p className="mt-1 text-xs text-ink-muted">
                  Used {naira(row.used)} of {naira(row.value)}
                </p>
              )}
              {row.pending && (
                <p className="mt-1 text-xs text-ink-muted">
                  Changing to{" "}
                  {row.pending.value === null ? "no limit" : naira(row.pending.value)}{" "}
                  at {formatDate(row.pending.effectiveAt)}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder={`₦${state.options.minLimit} or more`}
                  value={limitInputs[row.period] ?? ""}
                  onChange={(e) =>
                    setLimitInputs((prev) => ({
                      ...prev,
                      [row.period]: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  aria-label={`${PERIOD_LABEL[row.period]} deposit limit in naira`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveLimit(row.period)}
                  className="rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              {row.value !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeLimit(row.period)}
                  className="mt-2 text-xs font-semibold text-ink-muted underline disabled:opacity-50"
                >
                  Remove limit
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-surface p-4 shadow-card">
        <h2 className="text-sm font-bold">Take a break</h2>
        {state.exclusion.active && state.exclusion.until ? (
          <p className="mt-2 text-sm">
            You are on a break until{" "}
            <span className="font-semibold">{formatDate(state.exclusion.until)}</span>.
            Betting and deposits are paused. You can still withdraw.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            Pause betting and deposits. You cannot end a break early, and you
            can still withdraw your money.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {state.options.exclusionDays.map((days) => (
            <button
              key={days}
              type="button"
              disabled={busy}
              onClick={() => void takeBreak(days)}
              className="rounded-xl border border-ink-muted/20 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {days === 1 ? "24 hours" : `${days} days`}
            </button>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-ink-muted">
        Betting should be fun, never a way to make money. If it stops being
        fun, take a break and talk to someone you trust.
      </p>
    </main>
  );
}
