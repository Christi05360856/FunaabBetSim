"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { loginSchema } from "@/lib/validation/schemas";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the fields and try again.");
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 pt-16 pb-28">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Play money only
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold">FUNAAB BetSim</h1>
      </div>

      <div className="rounded-xl bg-surface p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold">Log in</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              className="rounded-lg border border-ink-muted bg-bg px-3 py-2 text-ink"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              className="rounded-lg border border-ink-muted bg-bg px-3 py-2 text-ink"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && <p className="text-sm text-loss">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href="/register" className="text-brand underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
