"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Transaction, TransactionType } from "@/types/domain";
import { formatMoney } from "@/lib/domain/selectionLabel";

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
  return new Date(ts).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });
}

export default function TransactionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");

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

  const filtered =
    filter === "all"
      ? transactions
      : transactions.filter((t) => t.type === filter);

  const groups: { heading: string; items: Transaction[] }[] = [];
  for (const tx of filtered) {
    const h = dateHeading(tx.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.heading === h) last.items.push(tx);
    else groups.push({ heading: h, items: [tx] });
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-bg overflow-x-hidden pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-muted/10 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">Transactions</h1>
      </header>

      <div className="-mx-0 flex gap-2 overflow-x-auto px-4 py-3">
        {(
          [
            { key: "all" as const, label: "All" },
            { key: "debit_bet" as const, label: "Bets" },
            { key: "payout" as const, label: "Wins" },
            { key: "refund" as const, label: "Refunds" },
            { key: "reset" as const, label: "Resets" },
          ] as const
        ).map((f) => (
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
        {groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            No transactions yet.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.heading} className="mb-4">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                {g.heading}
              </h2>
              <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
                {g.items.map((tx) => {
                  const positive = tx.amount > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 border-b border-ink-muted/10 px-4 py-3 last:border-0"
                    >
                      <span className="text-xl">
                        {TYPE_ICON[tx.type] ?? "•"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {TYPE_LABEL[tx.type] ?? tx.type}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {new Date(tx.createdAt).toLocaleString("en-NG", {
                            day: "2-digit",
                            month: "short",
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
                        title={
                          (positive ? "+" : "") +
                          "₦" +
                          Math.abs(tx.amount).toLocaleString("en-NG")
                        }
                      >
                        {positive ? "+" : ""}
                        {formatMoney(tx.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
