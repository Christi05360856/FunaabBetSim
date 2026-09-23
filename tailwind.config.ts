import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pitch: "#0E2A1E",     // deep green — main background
        pitchLine: "#1E4732", // lighter green — cards/panels
        naira: "#F2B705",     // gold — for odds and currency
        loss: "#C4453A",      // red — losing bets, errors
        win: "#3E8E5B",       // green — winning bets, primary buttons
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
