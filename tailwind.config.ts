import type { Config } from "tailwindcss";

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
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
