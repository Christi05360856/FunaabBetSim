import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Wallet } from "@/types/domain";
import { normalizeWallet } from "@/lib/domain/ledgerEngine";

async function countCollection(name: string): Promise<number> {
  try {
    const snap = await adminDb.collection(name).count().get();
    return snap.data().count;
  } catch {
    return -1;
  }
}

async function countWhere(
  name: string,
  field: string,
  op: "<" | "<=" | "==" | "!=" | ">=" | ">" | "array-contains" | "in" | "array-contains-any" | "not-in",
  value: unknown
): Promise<number> {
  try {
    const snap = await adminDb
      .collection(name)
      .where(field, op, value)
      .count()
      .get();
    return snap.data().count;
  } catch {
    return -1;
  }
}

/** Aggregate wallet liability (paginated — safe up to tens of thousands). */
async function sumWalletLiability(): Promise<{
  walletsScanned: number;
  purchased: number;
  promo: number;
  reservedStake: number;
  reservedWithdrawal: number;
  displayBalance: number;
}> {
  let purchased = 0;
  let promo = 0;
  let reservedStake = 0;
  let reservedWithdrawal = 0;
  let displayBalance = 0;
  let walletsScanned = 0;
  let last: import("firebase-admin/firestore").QueryDocumentSnapshot | null = null;

  for (let i = 0; i < 50; i++) {
    let q = adminDb.collection("wallets").orderBy("__name__").limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach((doc) => {
      const w = normalizeWallet(doc.data() as Wallet);
      purchased += w.purchased ?? 0;
      promo += w.promo ?? 0;
      reservedStake += w.reservedStake ?? 0;
      reservedWithdrawal += w.reservedWithdrawal ?? 0;
      displayBalance += w.balance ?? 0;
      walletsScanned += 1;
    });
    last = snap.docs[snap.docs.length - 1] ?? null;
    if (snap.size < 200) break;
  }

  return {
    walletsScanned,
    purchased,
    promo,
    reservedStake,
    reservedWithdrawal,
    displayBalance,
  };
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dayStart = startOfTodayMs();

  const [
    users,
    wallets,
    openBets,
    pendingWithdrawals,
    liability,
    depositsTodaySnap,
    rateLimitHits,
    securityToday,
  ] = await Promise.all([
    countCollection("users"),
    countCollection("wallets"),
    countWhere("bets", "status", "==", "open"),
    countWhere("withdrawals", "status", "==", "requested"),
    sumWalletLiability(),
    adminDb
      .collection("deposits")
      .where("status", "==", "success")
      .where("createdAt", ">=", dayStart)
      .limit(200)
      .get()
      .catch(async () => {
        // Fallback without composite index: recent docs filtered in memory
        try {
          const all = await adminDb
            .collection("deposits")
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();
          return all;
        } catch {
          return null;
        }
      }),
    countWhere("security_events", "type", "==", "RATE_LIMIT"),
    adminDb
      .collection("security_events")
      .where("createdAt", ">=", dayStart)
      .limit(1)
      .get()
      .catch(() => null),
  ]);

  let depositsTodayCount = 0;
  let depositsTodayNgn = 0;
  if (depositsTodaySnap) {
    depositsTodaySnap.forEach((d) => {
      const data = d.data() as {
        amountNgn?: number;
        status?: string;
        createdAt?: number;
      };
      if (data.status && data.status !== "success") return;
      if (data.createdAt != null && data.createdAt < dayStart) return;
      depositsTodayCount += 1;
      depositsTodayNgn += Number(data.amountNgn) || 0;
    });
  }

  // Pending withdrawals amount (sample last 40)
  let pendingWithdrawAmount = 0;
  try {
    const wSnap = await adminDb
      .collection("withdrawals")
      .where("status", "==", "requested")
      .limit(40)
      .get();
    wSnap.forEach((d) => {
      pendingWithdrawAmount += Number((d.data() as { amount?: number }).amount) || 0;
    });
  } catch {
    /* index may be missing — counts still useful */
  }

  return NextResponse.json({
    ok: true,
    generatedAt: Date.now(),
    users: { registered: users },
    wallets: { count: wallets },
    bets: { open: openBets },
    withdrawals: {
      pendingCount: pendingWithdrawals,
      pendingAmountSample: pendingWithdrawAmount,
    },
    depositsToday: {
      count: depositsTodayCount,
      amountNgn: depositsTodayNgn,
      note: "success deposits with creditedAt today (max 200 rows)",
    },
    liability: {
      ...liability,
      totalCashAtRisk:
        liability.purchased +
        liability.promo +
        liability.reservedStake +
        liability.reservedWithdrawal,
    },
    security: {
      rateLimitEventsTotal: rateLimitHits,
      hasEventsToday: securityToday ? !securityToday.empty : false,
    },
  });
}
