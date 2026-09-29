import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { BetSlipProvider } from "@/lib/context/BetSlipContext";
import { ThemeProvider } from "@/lib/context/ThemeProvider";
import { BetSlip } from "@/components/BetSlip";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

const displayFont = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
  fallback: ["system-ui", "arial"],
  adjustFontFallback: true,
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
  display: "swap",
  fallback: ["system-ui", "arial"],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "FUNAAB BetSim",
  description:
    "A virtual, play-money sports-betting simulation for FUNAAB football.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            <BetSlipProvider>
              <AppHeader />
              {children}
              <BetSlip />
              <BottomNav />
            </BetSlipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
