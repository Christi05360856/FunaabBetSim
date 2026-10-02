"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Icons } from "./ui";

export type AdminTabId =
  | "overview"
  | "fixtures"
  | "import"
  | "withdrawals"
  | "promos"
  | "sponsors"
  | "tickets"
  | "platform"
  | "danger";

const NAV: { id: AdminTabId; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", icon: Icons.dashboard },
  { id: "fixtures", label: "Fixtures", icon: Icons.fixtures },
  { id: "import", label: "Import", icon: Icons.import },
  { id: "withdrawals", label: "Withdrawals", icon: Icons.import },
  { id: "promos", label: "Promos", icon: Icons.import },
  { id: "sponsors", label: "Sponsors", icon: Icons.import },
  { id: "tickets", label: "Tickets", icon: Icons.import },
  { id: "platform", label: "Platform", icon: Icons.dashboard },
  { id: "danger", label: "Danger", icon: Icons.danger },
];

type Theme = "dark" | "light";
const STORAGE_KEY = "funaab-admin-theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function useAdminTheme() {
  return useContext(ThemeContext);
}

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* ignore */
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
      <div data-admin-theme={theme} className="min-h-screen bg-adm-bg text-adm-ink">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useAdminTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg border border-adm-line px-2 py-1 text-xs text-adm-muted"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const activeColor = (id: AdminTabId) =>
    id === "danger" ? "text-adm-bad" : "text-adm-brand-ink";

  function go(id: AdminTabId) {
    onTabChange(id);
    setMenuOpen(false);
  }

  const navButtons = (
    <>
      {NAV.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => go(t.id)}
          aria-current={tab === t.id ? "page" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            tab === t.id
              ? `bg-adm-brand/10 ${activeColor(t.id)}`
              : "text-adm-muted hover:bg-adm-raised hover:text-adm-ink"
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-adm-line bg-adm-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-adm-line text-adm-ink md:hidden"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-adm-brand font-bold text-white">
              F
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-semibold leading-tight">
                FUNAAB BetSim
              </h1>
              <p className="text-xs text-adm-faint">Admin</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-adm-muted sm:block">
              {email}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Mobile side drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col gap-1 bg-adm-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Menu</p>
              <button
                type="button"
                className="text-adm-muted"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            {navButtons}
          </aside>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-48 shrink-0 md:block">
          <nav
            className="sticky top-20 flex flex-col gap-1"
            aria-label="Admin sections"
          >
            {navButtons}
          </nav>
        </aside>

        <div key={tab} className="min-w-0 flex-1 animate-adm-in pb-24 md:pb-0">
          {children}
        </div>
      </div>

      {/* Compact bottom bar — current section only + menu hint on small screens */}
      <nav
        aria-label="Admin sections"
        className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-adm-line bg-adm-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex min-w-[4.25rem] flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
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
