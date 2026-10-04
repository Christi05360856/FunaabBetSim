"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { useAuth } from "@/lib/auth/AuthContext";

export default function WithdrawalPinPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"set" | "change" | "reset">("set");
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/security/pin", {
          headers: { Authorization: "Bearer " + token },
        });
        const body = await res.json();
        if (res.ok) {
          setHasPin(Boolean(body.hasPin));
          setMode(body.hasPin ? "change" : "set");
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user]);

  async function submit() {
    if (!user) return;
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "reset") {
        if (!user.email || password.length < 6) {
          throw new Error("Enter your account password to reset PIN");
        }
        const cred = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, cred);
      }
      const token = await user.getIdToken(true);
      const res = await fetch("/api/security/pin", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pin,
          confirmPin,
          currentPin: mode === "change" ? currentPin : undefined,
          reset: mode === "reset",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setMsg(body.message ?? "PIN saved");
      setHasPin(true);
      setMode("change");
      setCurrentPin("");
      setPin("");
      setConfirmPin("");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || hasPin === null) {
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
          onClick={() => router.back()}
          className="text-lg"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="flex-1 font-display text-base font-bold">
          Withdrawal PIN
        </h1>
      </header>

      <div className="space-y-4 px-4 pt-6">
        <p className="text-sm text-ink-muted">
          A 4-digit PIN is required every time you request a withdrawal.
        </p>

        <div className="flex gap-2 text-xs">
          {hasPin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("change");
                  setError(null);
                }}
                className={`rounded-full px-3 py-1.5 font-semibold ${
                  mode === "change"
                    ? "bg-brand text-white"
                    : "bg-surface text-ink-muted"
                }`}
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                }}
                className={`rounded-full px-3 py-1.5 font-semibold ${
                  mode === "reset"
                    ? "bg-brand text-white"
                    : "bg-surface text-ink-muted"
                }`}
              >
                Forgot PIN
              </button>
            </>
          )}
        </div>

        <div className="rounded-2xl bg-surface p-5 shadow-card">
          {mode === "change" && hasPin && (
            <label className="block text-xs text-ink-muted">
              Current PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em]"
              />
            </label>
          )}

          {mode === "reset" && (
            <label className="mb-3 block text-xs text-ink-muted">
              Account password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
              />
            </label>
          )}

          <label className="mt-3 block text-xs text-ink-muted">
            {hasPin && mode !== "set" ? "New PIN" : "Create PIN"}
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em]"
            />
          </label>

          <label className="mt-3 block text-xs text-ink-muted">
            Confirm PIN
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em]"
            />
          </label>

          {error && (
            <p className="mt-3 text-sm text-loss" role="alert">
              {error}
            </p>
          )}
          {msg && (
            <p className="mt-3 text-sm text-brand" role="status">
              {msg}
            </p>
          )}

          <button
            type="button"
            disabled={busy || pin.length !== 4 || confirmPin.length !== 4}
            onClick={() => void submit()}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : hasPin ? "Update PIN" : "Set PIN"}
          </button>
        </div>
      </div>
    </main>
  );
}
