import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyWithdrawalRequest,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import { withdrawableBalance } from "@/lib/domain/wallet";
import {
  MAX_WITHDRAWAL,
  MIN_WITHDRAWAL,
  type Wallet,
  type Withdrawal,
} from "@/types/domain";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = decoded.uid;
  const ip = clientIp(request);
  const limited = await enforceRateLimit("withdraw_request", `uid:${uid}`);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount));
  const bankCode = String(body.bankCode ?? "").trim();
  const accountNumber = String(body.accountNumber ?? "").replace(/\s/g, "");
  const accountName = String(body.accountName ?? "").trim();

  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString("en-NG")}` },
      { status: 400 }
    );
  }
  if (amount > MAX_WITHDRAWAL) {
    return NextResponse.json(
      { error: `Maximum per request is ₦${MAX_WITHDRAWAL.toLocaleString("en-NG")}` },
      { status: 400 }
    );
  }
  if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json(
      { error: "Valid bank and 10-digit account number required" },
      { status: 400 }
    );
  }
  if (accountName.length < 3) {
    return NextResponse.json(
      { error: "Account name is required (must match bank records)" },
      { status: 400 }
    );
  }

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const walletRef = adminDb.collection("wallets").doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error("Wallet not found");
      const wallet = normalizeWallet(walletSnap.data() as Wallet);

      const free = withdrawableBalance(wallet);
      if (amount > free) {
        throw new Error(
          `Withdrawable balance is ₦${free.toLocaleString("en-NG")} (promo points cannot be withdrawn)`
        );
      }

      // Daily cap + single pending (filter in memory — avoids composite index)
      const dayStart = startOfTodayMs();
      const todayQ = await tx.get(
        adminDb.collection("withdrawals").where("uid", "==", uid).limit(40)
      );
      let dayTotal = 0;
      let hasPending = false;
      todayQ.forEach((doc) => {
        const w = doc.data() as Withdrawal;
        if (
          w.status === "requested" ||
          w.status === "pending_review" ||
          w.status === "approved" ||
          w.status === "processing"
        ) {
          hasPending = true;
        }
        if (w.createdAt >= dayStart && w.status !== "rejected" && w.status !== "payment_failed") {
          dayTotal += w.amount;
        }
      });
      if (hasPending) {
        throw new Error("You already have a pending withdrawal. Wait for it to finish.");
      }
      if (dayTotal + amount > MAX_WITHDRAWAL) {
        throw new Error(
          `Daily limit is ₦${MAX_WITHDRAWAL.toLocaleString("en-NG")}. Already requested ₦${dayTotal.toLocaleString("en-NG")} today.`
        );
      }

      const nextWallet = applyWithdrawalRequest(wallet, amount);
      const now = Date.now();
      tx.update(walletRef, {
        purchased: nextWallet.purchased,
        promo: nextWallet.promo,
        reservedStake: nextWallet.reservedStake,
        reservedWithdrawal: nextWallet.reservedWithdrawal,
        balance: nextWallet.balance,
        updatedAt: now,
      });

      const wRef = adminDb.collection("withdrawals").doc();
      const withdrawal: Withdrawal = {
        id: wRef.id,
        uid,
        amount,
        bankCode,
        accountNumber,
        accountName,
        status: "pending_review",
        adminNote: null,
        flwTransferId: null,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(wRef, withdrawal);

      const ledRef = adminDb.collection("ledger").doc();
      tx.set(
        ledRef,
        buildLedgerEntry({
          id: ledRef.id,
          uid,
          type: "WITHDRAWAL_REQUEST",
          amount: -amount,
          balanceBefore: wallet.balance,
          balanceAfter: nextWallet.balance,
          withdrawalId: wRef.id,
          referenceId: wRef.id,
          now,
        })
      );

      const trRef = adminDb.collection("transactions").doc();
      tx.set(trRef, {
        id: trRef.id,
        uid,
        type: "WITHDRAWAL_REQUEST",
        amount: -amount,
        balanceBefore: wallet.balance,
        balanceAfter: nextWallet.balance,
        betId: null,
        status: "pending",
        referenceId: wRef.id,
        createdAt: now,
      });

      return { id: wRef.id, amount, withdrawableAfter: withdrawableBalance(nextWallet) };
    });

    void securityLog({ type: "WITHDRAW_REQUESTED", uid, ip, meta: { amount } });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    const status = msg.includes("pending") || msg.includes("limit") || msg.includes("Withdrawable")
      ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
