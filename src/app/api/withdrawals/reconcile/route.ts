import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyWithdrawalComplete,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import { flutterwaveGetTransfer } from "@/lib/payments/flutterwave";
import type { Wallet, Withdrawal } from "@/types/domain";
import { requireAdminTotp } from "@/lib/security/adminTotp";
import { writeAdminAudit } from "@/lib/security/adminAudit";

/**
 * M-09 — Reconcile a withdrawal that is processing / payment_failed / unknown.
 * body: { withdrawalId, totpCode? }
 *
 * Rules:
 * - SUCCESSFUL provider → complete wallet once (idempotent)
 * - FAILED / ERROR → mark payment_failed (funds stay reserved until reject/manual)
 * - PENDING / NEW → report only, do not complete
 * - Never blind-retry a transfer here
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const withdrawalId = String(
    (body as { withdrawalId?: string }).withdrawalId ?? ""
  ).trim();
  const totpErr = requireAdminTotp((body as { totpCode?: string }).totpCode);
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }
  if (!withdrawalId) {
    return NextResponse.json(
      { error: "withdrawalId required" },
      { status: 400 }
    );
  }

  const wRef = adminDb.collection("withdrawals").doc(withdrawalId);
  const wSnap = await wRef.get();
  if (!wSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const withdrawal = wSnap.data() as Withdrawal;

  if (withdrawal.status === "completed") {
    return NextResponse.json({
      ok: true,
      status: "completed",
      message: "Already completed",
    });
  }
  if (withdrawal.status === "rejected") {
    return NextResponse.json(
      { error: "Withdrawal was rejected" },
      { status: 400 }
    );
  }

  const transferId = withdrawal.flwTransferId;
  if (!transferId) {
    return NextResponse.json(
      {
        error:
          "No Flutterwave transfer id on this withdrawal. Use manual approve or wait for FLW attempt.",
        status: withdrawal.status,
      },
      { status: 400 }
    );
  }

  let provider: {
    id: number;
    status?: string;
    reference?: string;
    complete_message?: string;
  };
  try {
    provider = await flutterwaveGetTransfer(transferId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Provider lookup failed";
    await wRef.update({
      lastProviderCheckAt: Date.now(),
      providerStatus: "unknown",
      adminNote: msg.slice(0, 300),
      updatedAt: Date.now(),
    });
    return NextResponse.json(
      { error: msg, status: "unknown" },
      { status: 502 }
    );
  }

  const pStatus = String(provider.status ?? "").toUpperCase();

  await writeAdminAudit({
    adminUid: admin.uid,
    adminEmail: admin.email ?? null,
    action: "other",
    targetType: "withdrawal",
    targetId: withdrawalId,
    meta: {
      event: "withdrawal_reconcile_check",
      providerStatus: pStatus,
      flwTransferId: transferId,
      providerReference: provider.reference,
    },
  });

  // Terminal success
  if (
    pStatus === "SUCCESSFUL" ||
    pStatus === "SUCCESS" ||
    pStatus === "COMPLETED"
  ) {
    try {
      await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(wRef);
        const w = fresh.data() as Withdrawal;
        if (w.status === "completed") return;

        const walletRef = adminDb.collection("wallets").doc(w.uid);
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) throw new Error("Wallet missing");
        const wallet = normalizeWallet(walletSnap.data() as Wallet);
        const next = applyWithdrawalComplete(wallet, w.amount);
        const now = Date.now();

        tx.update(walletRef, {
          purchased: next.purchased,
          promo: next.promo,
          reservedStake: next.reservedStake,
          reservedWithdrawal: next.reservedWithdrawal,
          balance: next.balance,
          updatedAt: now,
        });

        tx.update(wRef, {
          status: "completed",
          flwTransferId: String(transferId),
          providerStatus: pStatus,
          lastProviderCheckAt: now,
          updatedAt: now,
        });

        const ledRef = adminDb.collection("ledger").doc();
        tx.set(
          ledRef,
          buildLedgerEntry({
            id: ledRef.id,
            uid: w.uid,
            type: "WITHDRAWAL_COMPLETED",
            amount: -w.amount,
            balanceBefore: wallet.balance,
            balanceAfter: next.balance,
            withdrawalId: w.id ?? withdrawalId,
            now,
          })
        );
      });

      await writeAdminAudit({
        adminUid: admin.uid,
        adminEmail: admin.email ?? null,
        action: "withdrawal_approve",
        targetType: "withdrawal",
        targetId: withdrawalId,
        meta: {
          event: "withdrawal_reconcile_completed",
          flwTransferId: transferId,
          providerStatus: pStatus,
        },
      });

      return NextResponse.json({
        ok: true,
        status: "completed",
        providerStatus: pStatus,
        message: "Provider success — withdrawal marked completed",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Complete failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Terminal failure
  if (
    pStatus === "FAILED" ||
    pStatus === "FAILURE" ||
    pStatus === "ERROR" ||
    pStatus === "CANCELLED"
  ) {
    await wRef.update({
      status: "payment_failed",
      providerStatus: pStatus,
      lastProviderCheckAt: Date.now(),
      adminNote: (provider.complete_message ?? pStatus).slice(0, 300),
      updatedAt: Date.now(),
    });
    return NextResponse.json({
      ok: true,
      status: "payment_failed",
      providerStatus: pStatus,
      message:
        "Provider reports failure. Funds still reserved — reject to release or retry FLW carefully.",
    });
  }

  // Still in flight
  await wRef.update({
    providerStatus: pStatus || "PENDING",
    lastProviderCheckAt: Date.now(),
    updatedAt: Date.now(),
  });

  return NextResponse.json({
    ok: true,
    status: withdrawal.status,
    providerStatus: pStatus || "PENDING",
    message: "Transfer still pending at provider — check again later",
  });
}
