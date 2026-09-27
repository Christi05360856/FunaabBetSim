"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BetLeg } from "@/types/domain";

export type SlipItem = BetLeg & {
  homeTeamName: string;
  awayTeamName: string;
  marketName: string;
};

type BetSlipContextType = {
  items: SlipItem[];
  addItem: (item: SlipItem) => void;
  removeItem: (matchId: string) => void;
  clearSlip: () => void;
  loadLegs: (legs: SlipItem[]) => void;
  totalOdds: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

const STORAGE_KEY = "funaab_betslip";

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SlipItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as SlipItem[]);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const addItem = useCallback((newItem: SlipItem) => {
    setItems((prev) => {
      // One selection per match (standard sportsbook)
      const filtered = prev.filter((i) => i.matchId !== newItem.matchId);
      return [...filtered, newItem];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((matchId: string) => {
    setItems((prev) => prev.filter((i) => i.matchId !== matchId));
  }, []);

  const clearSlip = useCallback(() => setItems([]), []);

  const loadLegs = useCallback((legs: SlipItem[]) => {
    setItems(legs);
    setIsOpen(true);
  }, []);

  const totalOdds = useMemo(
    () => items.reduce((acc, item) => acc * (item.odds || 1), 1),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      clearSlip,
      loadLegs,
      totalOdds,
      isOpen,
      setIsOpen,
    }),
    [items, addItem, removeItem, clearSlip, loadLegs, totalOdds, isOpen]
  );

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) {
    throw new Error("useBetSlip must be used within a BetSlipProvider");
  }
  return ctx;
}
