import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth/AuthContext";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUNAAB BetSim",
  description: "A virtual, play-money sports-betting simulation for FUNAAB football.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
