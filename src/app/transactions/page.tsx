"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Transaction, TransactionType } from "@/types/domain";

const TYPE_LABEL: Record<TransactionType, string> = {
  debit_bet: "Bet placed",
  payout: "Bet won",
  refund: "Bet refunded",
  reset: "Balance reset",
};

const TYPE_ICON: Record<TransactionType, string> = {
  debit_bet: "🎫",
  payout: "🏆",
  refund: "↩️",
  reset: "🔄",
};

function dateHeading(ts: number) {
  return new Date(ts).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

export default function TransactionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

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

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    );
  }

  // Group by month, SportyBet-style ("September 2026" section headers).
  const groups: { heading: string; items: Transaction[] }[] = [];
  for (const tx of transactions) {
    const heading = dateHeading(tx.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(tx);
    else groups.push({ heading, items: [tx] });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col pb-28">
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <button onClick={() => router.back()} className="text-white" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="flex-1 font-display text-lg font-bold">Transactions</h1>
      </header>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 text-5xl">🧾</div>
          <p className="text-ink-muted">No transactions yet</p>
        </div>
      ) : (
        <div className="flex flex-col px-4 pt-4">
          {groups.map((group) => (
            <div key={group.heading} className="mb-4">
              <p className="mb-2 px-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
                {group.heading}
              </p>
              <div className="rounded-2xl bg-surface shadow-card divide-y divide-ink-muted/10">
                {group.items.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="text-xl">{TYPE_ICON[tx.type]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{TYPE_LABEL[tx.type]}</p>
                      <p className="text-xs text-ink-muted">
                        {new Date(tx.createdAt).toLocaleString("en-NG", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={
                        "shrink-0 text-sm font-semibold tabular-nums " +
                        (tx.amount < 0 ? "text-loss" : "text-win")
                      }
                    >
                      {tx.amount < 0 ? "-" : "+"}₦{Math.abs(tx.amount).toLocaleString("en-NG")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
