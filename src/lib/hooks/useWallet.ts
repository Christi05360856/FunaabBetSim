"use client";

/**
 * Live wallet balance for the current user. Reads straight from Firestore
 * (rules already allow a user to read their own /wallets/{uid} doc) rather
 * than polling the /api/wallet route — same pattern every other page already
 * uses for matches/teams, and it means the header balance updates itself the
 * instant a bet settles, with no extra fetch.
 */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Wallet } from "@/types/domain";

export function useWallet(): { wallet: Wallet | null; loading: boolean } {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "wallets", user.uid),
      (snap) => {
        setWallet(snap.exists() ? (snap.data() as Wallet) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user]);

  return { wallet, loading };
}
