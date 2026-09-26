"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { registerSchema } from "@/lib/validation/schemas";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({ email, password, displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the fields and try again.");
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data.email, parsed.data.password, parsed.data.displayName);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand font-display text-xl font-bold text-white">F</span>
        <h1 className="mt-3 font-display text-2xl font-bold">FUNAAB BetSim</h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">Play money only · Nothing is real</p>
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-card">
        <h2 className="mb-4 font-display text-lg font-bold">Create your account</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input
              className="rounded-xl border border-ink-muted/25 bg-surface-raised px-3 py-2.5 text-ink outline-none focus:border-brand"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>
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
            Password
            <input
              type="password"
              className="rounded-xl border border-ink-muted/25 bg-surface-raised px-3 py-2.5 text-ink outline-none focus:border-brand"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error && <p className="text-sm font-medium text-loss">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-xl bg-brand px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
