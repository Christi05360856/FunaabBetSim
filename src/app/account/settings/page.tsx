"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, type ThemePreference } from "@/lib/context/ThemeProvider";

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-bg pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-muted/10 bg-brand px-4 py-3 text-white">
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="text-lg"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="flex-1 font-display text-base font-bold">Settings</h1>
      </header>

      <div className="px-4 pt-4">
        <Section title="Account">
          <Row label="Profile" href="/account/profile" />
          <Row label="Email" value={user.email ?? "—"} />
        </Section>

        <Section title="Security">
          <Row label="Change password" href="/account/settings/password" />
          <Row label="Withdrawal PIN" href="/account/settings/pin" />
        </Section>

        <Section title="Safer play">
          <Row label="Age check, deposit limits and breaks" href="/account/safety" />
        </Section>

        <Section title="Appearance">
          {(
            [
              { key: "light" as ThemePreference, label: "Light" },
              { key: "dark" as ThemePreference, label: "Dark" },
              { key: "system" as ThemePreference, label: "Follow system" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTheme(opt.key)}
              className="flex w-full items-center justify-between border-b border-ink-muted/10 px-4 py-3.5 text-left last:border-0"
            >
              <span className="text-sm text-ink">{opt.label}</span>
              {theme === opt.key && (
                <span className="font-bold text-brand">✓</span>
              )}
            </button>
          ))}
        </Section>

        <Section title="Legal">
          <Row label="Terms of use" href="/terms" />
          <Row label="Privacy policy" href="/privacy" />
          <Row label="About" href="/about" />
        </Section>

        <Section title="Support">
          <Row label="How to play" href="/how-to-play" />
          <Row label="Verify ticket" href="/verify" />
        </Section>

        <button
          type="button"
          onClick={logout}
          className="mt-4 w-full rounded-2xl bg-surface py-3.5 text-sm font-semibold text-loss shadow-card"
        >
          Log out
        </button>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl bg-surface shadow-card">
      <p className="bg-ink-muted/5 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  label,
  href,
  value,
}: {
  label: string;
  href?: string;
  value?: string;
}) {
  if (href) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between border-b border-ink-muted/10 px-4 py-3.5 last:border-0"
      >
        <span className="text-sm text-ink">{label}</span>
        <span className="text-ink-muted">›</span>
      </Link>
    );
  }
  return (
    <div className="flex items-center justify-between border-b border-ink-muted/10 px-4 py-3.5 last:border-0">
      <span className="text-sm text-ink">{label}</span>
      <span className="max-w-[55%] truncate text-xs text-ink-muted">
        {value}
      </span>
    </div>
  );
}
