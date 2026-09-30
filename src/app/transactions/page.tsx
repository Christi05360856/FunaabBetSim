"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Transaction, TransactionType } from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";

const TYPE_LABEL: Record<string, string> = {
  debit_bet: "Bet placed",
  payout: "Bet won",
  refund: "Bet refunded",
  reset: "Balance reset",
  DEPOSIT_INITIATED: "Deposit started",
  DEPOSIT_SUCCESS: "Deposit successful",
  PURCHASED_POINTS_CREDIT: "Points purchased",
  PROMO_POINTS_CREDIT: "Promo points",
  BET_STAKE_RESERVE: "Bet stake reserved",
  BET_WIN_SETTLEMENT: "Bet won",
  BET_LOSS_SETTLEMENT: "Bet lost",
  BET_VOID_REFUND: "Bet void refund",
  WITHDRAWAL_REQUEST: "Withdrawal requested",
  WITHDRAWAL_APPROVED: "Withdrawal approved",
  WITHDRAWAL_COMPLETED: "Withdrawal completed",
  WITHDRAWAL_REJECTED: "Withdrawal rejected",
  WITHDRAWAL_FAILED: "Withdrawal failed",
  ADMIN_ADJUSTMENT: "Admin adjustment",
};

const TYPE_ICON: Record<string, string> = {
  debit_bet: "🎫",
  payout: "🏆",
  refund: "↩️",
  reset: "🔄",
  DEPOSIT_INITIATED: "⏳",
  DEPOSIT_SUCCESS: "💳",
  PURCHASED_POINTS_CREDIT: "💳",
  PROMO_POINTS_CREDIT: "🎁",
  BET_STAKE_RESERVE: "🎫",
  BET_WIN_SETTLEMENT: "🏆",
  BET_LOSS_SETTLEMENT: "📉",
  BET_VOID_REFUND: "↩️",
  WITHDRAWAL_REQUEST: "🏦",
  WITHDRAWAL_APPROVED: "✅",
  WITHDRAWAL_COMPLETED: "💸",
  WITHDRAWAL_REJECTED: "❌",
  WITHDRAWAL_FAILED: "⚠️",
  ADMIN_ADJUSTMENT: "🛠️",
};

type FilterKey =
  | "all"
  | "bets"
  | "wins"
  | "deposits"
  | "withdrawals"
  | "promo";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bets", label: "Bets" },
  { key: "wins", label: "Wins" },
  { key: "deposits", label: "Deposits" },
  { key: "withdrawals", label: "Withdrawals" },
  { key: "promo", label: "Promo" },
];

const BET_TYPES: TransactionType[] = [
  "debit_bet",
  "BET_STAKE_RESERVE",
  "BET_LOSS_SETTLEMENT",
  "refund",
  "BET_VOID_REFUND",
];
const WIN_TYPES: TransactionType[] = ["payout", "BET_WIN_SETTLEMENT"];
const DEPOSIT_TYPES: TransactionType[] = [
  "DEPOSIT_INITIATED",
  "DEPOSIT_SUCCESS",
  "PURCHASED_POINTS_CREDIT",
];
const WITHDRAW_TYPES: TransactionType[] = [
  "WITHDRAWAL_REQUEST",
  "WITHDRAWAL_APPROVED",
  "WITHDRAWAL_COMPLETED",
  "WITHDRAWAL_REJECTED",
  "WITHDRAWAL_FAILED",
];
const PROMO_TYPES: TransactionType[] = ["PROMO_POINTS_CREDIT"];

function matchesFilter(t: Transaction, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "bets") return BET_TYPES.includes(t.type as TransactionType);
  if (filter === "wins") return WIN_TYPES.includes(t.type as TransactionType);
  if (filter === "deposits")
    return DEPOSIT_TYPES.includes(t.type as TransactionType);
  if (filter === "withdrawals")
    return WITHDRAW_TYPES.includes(t.type as TransactionType);
  if (filter === "promo")
    return PROMO_TYPES.includes(t.type as TransactionType);
  return true;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });
}

export default function TransactionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [month, setMonth] = useState<string>("all");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "transactions"), where("uid", "==", user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Transaction);
        list.sort((a, b) => b.createdAt - a.createdAt);
        setTransactions(list);
      }
    );
    return () => unsub();
  }, [user]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const t of transactions) keys.add(monthKey(t.createdAt));
    return Array.from(keys).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (!matchesFilter(t, filter)) return false;
      if (month !== "all" && monthKey(t.createdAt) !== month) return false;
      return true;
    });
  }, [transactions, filter, month]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-bg overflow-x-hidden pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-muted/10 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">Transactions</h1>
      </header>

      <div className="flex items-center gap-2 px-4 pt-3">
        <label className="text-[11px] font-semibold text-ink-muted shrink-0">
          Month
        </label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 bg-surface px-3 py-2 text-sm"
        >
          <option value="all">All months</option>
          {monthOptions.map((k) => (
            <option key={k} value={k}>
              {monthLabel(k)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold " +
              (filter === f.key
                ? "bg-brand text-white"
                : "bg-surface text-ink-muted shadow-card")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            No transactions yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
            {filtered.map((tx) => {
              const positive = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 border-b border-ink-muted/10 px-4 py-3 last:border-0"
                >
                  <span className="text-xl">{TYPE_ICON[tx.type] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {TYPE_LABEL[tx.type] ?? tx.type}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {new Date(tx.createdAt).toLocaleString("en-NG", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p
                    className={
                      "shrink-0 text-sm font-semibold tabular-nums " +
                      (positive ? "text-win" : "text-loss")
                    }
                  >
                    {positive ? "+" : ""}
                    {formatMoney(tx.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
               }
              
