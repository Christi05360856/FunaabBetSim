"use client";

import { useEffect, type ReactNode } from "react";
import type { MatchStatus } from "@/types/domain";

// Icons
export const Icons = {
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  fixtures: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  odds: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>,
  entities: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  import: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  danger: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
};

// Status Config
export const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-zinc-400", bg: "bg-zinc-500/10" },
  scheduled: { label: "Scheduled", color: "text-blue-400", bg: "bg-blue-500/10" },
  open: { label: "Open", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  locked: { label: "Locked", color: "text-amber-400", bg: "bg-amber-500/10" },
  live: { label: "Live", color: "text-red-400", bg: "bg-red-500/10" },
  halftime: { label: "HT", color: "text-amber-400", bg: "bg-amber-500/10" },
  second_half: { label: "2nd Half", color: "text-red-400", bg: "bg-red-500/10" },
  finished: { label: "Finished", color: "text-zinc-400", bg: "bg-zinc-500/10" },
  result_confirmed: { label: "Confirmed", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  settled: { label: "Settled", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  postponed: { label: "Postponed", color: "text-amber-400", bg: "bg-amber-500/10" },
  voided: { label: "Voided", color: "text-zinc-400", bg: "bg-zinc-500/10" },
};

// Components
export function Badge({ status }: { status: MatchStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div><h3 className="font-semibold text-zinc-100">{title}</h3>{subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500 ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 ${className}`} {...props}>{children}</select>;
}

export function Button({ children, variant = "primary", size = "md", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500",
    secondary: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
    danger: "bg-red-600/10 text-red-400 border border-red-600/30 hover:bg-red-600/20",
    ghost: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">{Icons.x}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", danger = false, loading = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-6 text-sm text-zinc-400">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>{loading ? "Working…" : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
      {type === "success" ? Icons.check : Icons.x}{message}
    </div>
  );
}

