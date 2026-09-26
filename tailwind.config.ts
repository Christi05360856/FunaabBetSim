import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          dark: "var(--color-brand-dark)",
        },
        accent: "var(--color-accent)",
        win: "var(--color-win)",
        loss: "var(--color-loss)",
        bg: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
        },
        ink: "var(--color-text)",
        "ink-muted": "var(--color-text-muted)",

        // Admin palette (driven by [data-admin-theme] CSS variables)
        "adm-bg": "var(--adm-color-bg)",
        "adm-surface": "var(--adm-color-surface)",
        "adm-raised": "var(--adm-color-raised)",
        "adm-ink": "var(--adm-color-ink)",
        "adm-muted": "var(--adm-color-muted)",
        "adm-faint": "var(--adm-color-faint)",
        "adm-line": "var(--adm-color-line)",
        "adm-line-strong": "var(--adm-color-line-strong)",
        "adm-brand": "var(--adm-color-brand)",
        "adm-brand-ink": "var(--adm-color-brand-ink)",
        "adm-ok": "var(--adm-color-ok)",
        "adm-warn": "var(--adm-color-warn)",
        "adm-bad": "var(--adm-color-bad)",
        "adm-info": "var(--adm-color-info)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        "adm-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "adm-in": "adm-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
