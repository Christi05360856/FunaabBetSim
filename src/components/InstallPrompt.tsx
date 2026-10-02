"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "fb_install_dismissed_v2";
const SHOWN_KEY = "fb_install_shown_v2";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * User-app install banner. Does not use the admin manifest.
 * Chrome only fires beforeinstallprompt when criteria pass AND no overlapping install.
 */
export default function InstallPrompt() {
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    // Don't show on admin routes — AdminLayout handles that install
    if (window.location.pathname.startsWith("/admin")) return;

    // Allow force-show: /?install=1
    try {
      if (new URLSearchParams(window.location.search).get("install") === "1") {
        localStorage.removeItem(DISMISS_KEY);
        localStorage.removeItem(SHOWN_KEY);
      }
    } catch {
      /* */
    }

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBip);

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    if (isIos) setIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (window.location.pathname.startsWith("/admin")) return;
    if (!user && !deferred && !iosHint) return;

    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }

    // Show if we have native prompt OR user is logged in (manual tip)
    const canShow = Boolean(deferred || iosHint || user);
    if (!canShow) return;

    try {
      if (!localStorage.getItem(SHOWN_KEY)) {
        localStorage.setItem(SHOWN_KEY, "1");
      }
    } catch {
      /* */
    }

    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, [user, deferred, iosHint]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) {
      dismiss();
      return;
    }
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
  }, [deferred, dismiss]);

  if (!visible || isStandalone()) return null;

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
            {iosHint && !deferred
              ? "Tap Share, then “Add to Home Screen”."
              : deferred
                ? "Add to your home screen — fullscreen, faster access."
                : "Chrome menu (⋮) → Install app / Add to Home screen. Use the F icon (not Admin FA)."}
          </p>
          <div className="mt-3 flex gap-2">
            {deferred && (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white"
              >
                Install
              </button>
            )}
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
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
