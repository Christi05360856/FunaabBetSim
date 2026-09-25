import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth/AuthContext";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

// Manrope for headings/numbers (odds, balances) — a little more character
// than a default system sans, still very legible at small sizes on mobile.
// Inter for body copy — extremely readable at 12–14px, which is most of
// this app's text.
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "FUNAAB BetSim",
  description: "A virtual, play-money sports-betting simulation for FUNAAB football.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <AuthProvider>
          <AppHeader />
          {children}
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
