"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { loginSchema } from "@/lib/validation/schemas";

export default function LoginPage() {
  const { login, resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Check the fields and try again."
      );
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      router.push("/dashboard");
    } catch {
      setError("Incorrect email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setError("Enter the email on your account.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(trimmed);
      setInfo(
        "If an account exists for that email, a reset link has been sent. Check inbox and spam."
      );
    } catch {
      setError(
        "Could not send reset email. Check the address and try again in a minute."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand font-display text-xl font-bold text-white">
          F
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold">FUNAAB BetSim</h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">
          Real points · Play responsibly · 18+
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 font-display text-lg font-bold">
          {mode === "login" ? "Log in" : "Reset password"}
        </h2>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                className="rounded-xl border border-ink-muted/25 bg-surface-raised px-3 py-2.5 text-ink outline-none focus:border-brand"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span className="flex items-center justify-between">
                Password
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-xs font-semibold text-brand"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                className="rounded-xl border border-ink-muted/25 bg-surface-raised px-3 py-2.5 text-ink outline-none focus:border-brand"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && <p className="text-sm font-medium text-loss">{error}</p>}
            {info && <p className="text-sm font-medium text-brand">{info}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 rounded-xl bg-brand px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {submitting ? "Logging in…" : "Log in"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setInfo(null);
              }}
              className="text-center text-sm font-semibold text-brand"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              Enter your account email. We&apos;ll send a link to set a new
              password (check spam if you don&apos;t see it).
            </p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                className="rounded-xl border border-ink-muted/25 bg-surface-raised px-3 py-2.5 text-ink outline-none focus:border-brand"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            {error && <p className="text-sm font-medium text-loss">{error}</p>}
            {info && <p className="text-sm font-medium text-brand">{info}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 rounded-xl bg-brand px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}
              className="text-center text-sm font-semibold text-brand"
            >
              Back to log in
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href="/register" className="font-semibold text-brand underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
