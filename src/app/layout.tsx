import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { BetSlipProvider } from "@/lib/context/BetSlipContext";
import { ThemeProvider } from "@/lib/context/ThemeProvider";
import { BetSlip } from "@/components/BetSlip";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import InstallPrompt from "@/components/InstallPrompt";
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
  title: {
    default: "FUNAAB BetSim",
    template: "%s · FUNAAB BetSim",
  },
  description:
    "Sports betting for the FUNAAB community — fixtures, accumulators, points wallet.",
  applicationName: "FUNAAB BetSim",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BetSim",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#064e3b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
              <InstallPrompt />
              <PwaRegister />
            </BetSlipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
