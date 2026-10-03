"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "fb_install_dismissed_v3";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Simple install banner — install or dismiss. No internal/admin wording. */
export default function InstallPrompt() {
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (window.location.pathname.startsWith("/admin")) return;

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (window.location.pathname.startsWith("/admin")) return;
    if (!user || !deferred) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 1000);
    return () => window.clearTimeout(t);
  }, [user, deferred]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* */
    }
    setDeferred(null);
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* */
    }
  }, [deferred]);

  if (!visible || !deferred || isStandalone()) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-20 z-[90] px-3 sm:bottom-6"
      role="dialog"
      aria-label="Install app"
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-brand/20 bg-surface p-4 shadow-lg">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
          F
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold">Install FUNAAB BetSim</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Add to your home screen for faster access.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl border border-ink-muted/20 px-3 py-2 text-xs font-semibold text-ink-muted"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-ink-muted"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
