"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

type Notice = { kind: "age" | "break"; until?: number } | null;

/**
 * Small banner shown on the dashboard when the player still has to confirm
 * their age, or is on a self-imposed break.
 */
export default function SafetyNotice() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/safety", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ageGateEnforced?: boolean;
          ageVerified?: boolean;
          exclusion?: { active?: boolean; until?: number | null };
        };
        if (cancelled) return;
        if (data.exclusion?.active && data.exclusion.until) {
          setNotice({ kind: "break", until: data.exclusion.until });
        } else if (data.ageGateEnforced && !data.ageVerified) {
          setNotice({ kind: "age" });
        }
      } catch {
        /* the banner is optional, so stay quiet on errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!notice) return null;

  if (notice.kind === "break") {
    const until = new Date(notice.until ?? 0).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return (
      <div className="rounded-2xl bg-surface p-4 text-sm shadow-card">
        <p className="font-semibold">You are taking a break until {until}</p>
        <p className="mt-1 text-ink-muted">
          Betting and deposits are paused. You can still withdraw.
        </p>
      </div>
    );
  }

  return (
    <Link
      href="/account/safety"
      className="block rounded-2xl border border-brand/30 bg-brand/10 p-4 text-sm shadow-card"
    >
      <p className="font-semibold text-brand">Confirm your age (18+)</p>
      <p className="mt-1 text-ink-muted">
        Add your date of birth to keep betting and depositing. Tap to continue.
      </p>
    </Link>
  );
}
