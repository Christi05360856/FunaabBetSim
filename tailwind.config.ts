import type { Config } from "tailwindcss";

// Admin theme colours read CSS variables (see globals.css) so one class works
// in both light and dark mode. The "/ <alpha-value>" bit keeps things like
// bg-adm-brand/10 working.
const adm = (name: string) => `rgb(var(--adm-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--color-brand)",       // FUNAAB green
        accent: "var(--color-accent)",     // FUNAAB gold
        win: "var(--color-win)",
        loss: "var(--color-loss)",
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        ink: "var(--color-text)",
        "ink-muted": "var(--color-text-muted)",
        adm: {
          bg: adm("bg"),
          surface: adm("surface"),
          raised: adm("raised"),
          line: adm("line"),
          "line-strong": adm("line-strong"),
          ink: adm("ink"),
          muted: adm("muted"),
          faint: adm("faint"),
          brand: adm("brand"),
          "brand-ink": adm("brand-ink"),
          info: adm("info"),
          ok: adm("ok"),
          warn: adm("warn"),
          bad: adm("bad"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      keyframes: {
        "adm-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "adm-in": "adm-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
