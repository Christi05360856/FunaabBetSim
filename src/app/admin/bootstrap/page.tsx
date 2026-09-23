"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

export default function BootstrapAdminPage() {
  const { user, loading } = useAuth();
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    if (!user) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error ?? "Something went wrong.");
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-ink">
        Log in first, then come back to this page.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-xl font-semibold">Admin bootstrap</h1>
      <p className="text-sm text-ink-muted">
        Logged in as {user.email}. Enter the secret to promote this account to admin.
      </p>
      <input
        type="password"
        className="rounded-lg border border-ink-muted bg-surface px-3 py-2 text-ink"
        placeholder="Secret phrase"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
      />
      <button
        onClick={handleClick}
        disabled={submitting || !secret}
        className="rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Working…" : "Make me admin"}
      </button>
      {message && <p className="text-sm text-ink-muted">{message}</p>}
    </main>
  );
}
