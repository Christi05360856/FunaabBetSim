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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 pt-16 pb-28">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Play money only
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold">FUNAAB BetSim</h1>
      </div>

      <div className="rounded-xl bg-surface p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold">Create your account</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              className="rounded-lg border border-ink-muted bg-bg px-3 py-2 text-ink"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>
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
              autoComplete="new-password"
            />
          </label>

          {error && <p className="text-sm text-loss">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
