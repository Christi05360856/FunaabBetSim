"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { useAuth } from "@/lib/auth/AuthContext";

export default function ChangePasswordPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"old" | "new">("old");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  async function verifyOld() {
    if (!user?.email) return;
    setError(null);
    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, oldPassword);
      await reauthenticateWithCredential(user, cred);
      setStep("new");
    } catch {
      setError("Old password is incorrect");
    } finally {
      setBusy(false);
    }
  }

  async function saveNew() {
    if (!user) return;
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password === oldPassword) {
      setError("New password must be different");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(user, password);
      setDone(true);
    } catch (e) {
      const msg =
        e instanceof Error && e.message.includes("requires-recent-login")
          ? "Session expired — enter your old password again"
          : "Could not update password. Try again.";
      if (msg.includes("Session")) setStep("old");
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

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
          onClick={() => router.back()}
          className="text-lg"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="flex-1 font-display text-base font-bold">
          Change password
        </h1>
      </header>

      <div className="space-y-4 px-4 pt-6">
        {done ? (
          <div className="rounded-2xl bg-surface p-5 text-center shadow-card">
            <p className="font-semibold text-brand">Password updated</p>
            <p className="mt-2 text-sm text-ink-muted">
              Use your new password next time you sign in.
            </p>
            <button
              type="button"
              onClick={() => router.push("/account/settings")}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
            >
              Back to settings
            </button>
          </div>
        ) : step === "old" ? (
          <div className="rounded-2xl bg-surface p-5 shadow-card">
            <p className="text-sm text-ink-muted">
              Enter your current password to continue.
            </p>
            <label className="mt-4 block text-xs text-ink-muted">
              Current password
              <div className="relative mt-1">
                <input
                  type={showOld ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 pr-12 text-sm"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted"
                  onClick={() => setShowOld((v) => !v)}
                >
                  {showOld ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            {error && (
              <p className="mt-2 text-sm text-loss" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={busy || oldPassword.length < 6}
              onClick={() => void verifyOld()}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Checking…" : "Next"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface p-5 shadow-card">
            <p className="text-sm text-ink-muted">
              Create a strong password for your account.
            </p>
            <label className="mt-4 block text-xs text-ink-muted">
              New password
              <div className="relative mt-1">
                <input
                  type={showNew ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 pr-12 text-sm"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted"
                  onClick={() => setShowNew((v) => !v)}
                >
                  {showNew ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <label className="mt-3 block text-xs text-ink-muted">
              Confirm password
              <input
                type={showNew ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-ink-muted/20 bg-bg px-3 py-2.5 text-sm"
              />
            </label>
            {error && (
              <p className="mt-2 text-sm text-loss" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={busy || password.length < 8 || confirm.length < 8}
              onClick={() => void saveNew()}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Confirm"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
