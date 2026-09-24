"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { MatchStatus } from "@/types/domain";

// ---- Icons ------------------------------------------------------------------
export const Icons = {
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  fixtures: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  odds: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>,
  entities: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  import: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  danger: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
};

// ---- Status badges ----------------------------------------------------------
// Full class strings on purpose: Tailwind only generates classes it can see.
export const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-adm-muted", bg: "bg-adm-muted/10" },
  scheduled: { label: "Scheduled", color: "text-adm-info", bg: "bg-adm-info/10" },
  open: { label: "Open", color: "text-adm-ok", bg: "bg-adm-ok/10" },
  locked: { label: "Locked", color: "text-adm-warn", bg: "bg-adm-warn/10" },
  live: { label: "Live", color: "text-adm-bad", bg: "bg-adm-bad/10" },
  halftime: { label: "HT", color: "text-adm-warn", bg: "bg-adm-warn/10" },
  second_half: { label: "2nd Half", color: "text-adm-bad", bg: "bg-adm-bad/10" },
  finished: { label: "Finished", color: "text-adm-muted", bg: "bg-adm-muted/10" },
  result_confirmed: { label: "Confirmed", color: "text-adm-ok", bg: "bg-adm-ok/10" },
  settled: { label: "Settled", color: "text-adm-ok", bg: "bg-adm-ok/10" },
  postponed: { label: "Postponed", color: "text-adm-warn", bg: "bg-adm-warn/10" },
  voided: { label: "Voided", color: "text-adm-muted", bg: "bg-adm-muted/10" },
};

export function Badge({ status }: { status: MatchStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
}

// ---- Layout pieces ----------------------------------------------------------
// `compact` / `flush` replace the old className="p-4" / "p-0" overrides, which
// lose to the default p-5 in Tailwind's stylesheet order.
export function Card({ children, className = "", compact = false, flush = false }: { children: ReactNode; className?: string; compact?: boolean; flush?: boolean }) {
  const pad = flush ? "" : compact ? "p-4" : "p-5";
  return <div className={`rounded-xl border border-adm-line bg-adm-surface shadow-sm ${pad} ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-semibold text-adm-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-adm-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-sm font-medium text-adm-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-adm-muted">{hint}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-adm-muted">{label}</span>
      {children}
    </label>
  );
}

// ---- Form controls ----------------------------------------------------------
export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-lg border border-adm-line-strong bg-adm-raised px-3 py-2 text-sm text-adm-ink placeholder:text-adm-faint outline-none focus:border-adm-brand disabled:opacity-60 ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`w-full rounded-lg border border-adm-line-strong bg-adm-raised px-3 py-2 text-sm text-adm-ink outline-none focus:border-adm-brand disabled:opacity-60 ${className}`} {...props}>{children}</select>;
}

export function Button({ children, variant = "primary", size = "md", className = "", type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-brand/50 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-3 py-2 text-xs", md: "px-4 py-2.5 text-sm" };
  const variants = {
    primary: "bg-adm-brand text-white hover:bg-adm-brand/90",
    secondary: "border border-adm-line-strong bg-adm-raised text-adm-ink hover:bg-adm-line",
    danger: "border border-adm-bad/30 bg-adm-bad/10 text-adm-bad hover:bg-adm-bad/20",
    ghost: "text-adm-muted hover:bg-adm-raised hover:text-adm-ink",
  };
  return <button type={type} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

// ---- Overlays ---------------------------------------------------------------
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-adm-line-strong bg-adm-surface p-6 shadow-2xl animate-adm-in">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-adm-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-adm-faint hover:text-adm-ink">{Icons.x}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", danger = false, loading = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-6 text-sm text-adm-muted">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>{loading ? "Working…" : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// Sits above the mobile bottom nav (bottom-20) and returns to the corner on desktop.
// onClose lives in a ref so re-renders from live data don't restart the 4s timer.
export function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => closeRef.current(), 4000);
    return () => clearTimeout(t);
  }, [message, type]);
  return (
    <div role="status" className={`fixed inset-x-4 bottom-20 z-[60] flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg md:inset-x-auto md:bottom-4 md:right-4 ${type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
      {type === "success" ? Icons.check : Icons.x}<span className="min-w-0">{message}</span>
    </div>
  );
                       }
