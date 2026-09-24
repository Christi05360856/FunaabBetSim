"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Icons } from "./ui";

export type AdminTabId = "overview" | "fixtures" | "odds" | "entities" | "import" | "danger";

const NAV: { id: AdminTabId; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", icon: Icons.dashboard },
  { id: "fixtures", label: "Fixtures", icon: Icons.fixtures },
  { id: "odds", label: "Odds", icon: Icons.odds },
  { id: "entities", label: "Teams", icon: Icons.entities },
  { id: "import", label: "Import", icon: Icons.import },
  { id: "danger", label: "Danger", icon: Icons.danger },
];

// ---- Theme ------------------------------------------------------------------
type Theme = "dark" | "light";
const STORAGE_KEY = "funaab-admin-theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });

export function useAdminTheme() {
  return useContext(ThemeContext);
}

/** Wraps everything on /admin (including the loading and access-denied screens). */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  // Starts dark (the original look) and switches to the saved choice after mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* storage blocked (private mode) — stay on default */
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div data-admin-theme={theme} className="min-h-screen bg-adm-bg text-adm-ink antialiased">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useAdminTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-adm-line-strong text-adm-muted transition-colors hover:bg-adm-raised hover:text-adm-ink"
    >
      {theme === "dark" ? Icons.sun : Icons.moon}
    </button>
  );
}

// ---- Layout -----------------------------------------------------------------
export default function AdminLayout({
  tab,
  onTabChange,
  email,
  children,
}: {
  tab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
  email: string;
  children: ReactNode;
}) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const activeColor = (id: AdminTabId) => (id === "danger" ? "text-adm-bad" : "text-adm-brand-ink");

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-adm-line bg-adm-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-adm-brand font-bold text-white">F</div>
            <div className="min-w-0">
              <h1 className="truncate font-semibold leading-tight">FUNAAB BetSim</h1>
              <p className="text-xs text-adm-faint">Admin</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-adm-muted sm:block">{email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-48 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-1" aria-label="Admin sections">
            {NAV.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.id ? `bg-adm-brand/10 ${activeColor(t.id)}` : "text-adm-muted hover:bg-adm-raised hover:text-adm-ink"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* key={tab} replays the fade-in every time you switch tabs */}
        <div key={tab} className="min-w-0 flex-1 animate-adm-in pb-24 md:pb-0">
          {children}
        </div>
      </div>

      <nav
        aria-label="Admin sections"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-adm-line bg-adm-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              tab === t.id ? activeColor(t.id) : "text-adm-faint"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}

