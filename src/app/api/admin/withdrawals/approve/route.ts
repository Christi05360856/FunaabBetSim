import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyWithdrawalComplete,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import { flutterwaveTransfer } from "@/lib/payments/flutterwave";
import type { Wallet, Withdrawal } from "@/types/domain";
import { requireAdminTotpOnce } from "@/lib/security/adminTotpGuard";
import { resolveUserEmail, sendMail } from "@/lib/email/send";
import { withdrawalEmailHtml } from "@/lib/email/templates";
import { writeAdminAudit } from "@/lib/security/adminAudit";

/**
 * body: { withdrawalId, mode: "manual" | "flutterwave", note?, totpCode? }
 *
 * manual      → you already sent money outside the app → mark completed
 * flutterwave → request transfer, save id, stay **processing** until reconcile
 *               sees SUCCESSFUL (do not complete early)
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const withdrawalId = String(body.withdrawalId ?? "").trim();
  const mode = body.mode === "flutterwave" ? "flutterwave" : "manual";
  const note = body.note != null ? String(body.note).slice(0, 300) : null;

  const totpErr = await requireAdminTotpOnce(
    (body as { totpCode?: string }).totpCode
  );
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

  // Atomically claim → processing before any provider call
  let withdrawal: Withdrawal;
  try {
    withdrawal = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(wRef);
      if (!snap.exists) throw new Error("Not found");
      const w = snap.data() as Withdrawal;
      if (w.status === "completed") {
        throw new Error("Already completed");
      }
      if (w.status === "processing" && mode === "flutterwave") {
        // Allow re-entry only if no transfer id yet (retry after unclear error)
        if (w.flwTransferId) {
          throw new Error(
            "Already processing — use Reconcile to check provider status"
          );
        }
      }
      if (w.status === "rejected") {
        throw new Error("Already rejected");
      }
      if (
        w.status !== "pending_review" &&
        w.status !== "requested" &&
        w.status !== "approved" &&
        w.status !== "payment_failed" &&
        w.status !== "processing"
      ) {
        throw new Error(`Cannot approve status ${w.status}`);
      }
      const now = Date.now();
      tx.update(wRef, {
        status: "processing",
        updatedAt: now,
        ...(note ? { adminNote: note } : {}),
      });
      return { ...w, status: "processing" as const };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Claim failed";
    const status = msg === "Not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  let flwTransferId: string | null =
    withdrawal.flwTransferId != null
      ? String(withdrawal.flwTransferId)
      : null;

  // ---- Flutterwave transfer: request only, stay processing ----
  if (mode === "flutterwave") {
    try {
      const transfer = await flutterwaveTransfer({
        account_bank: withdrawal.bankCode,
        account_number: withdrawal.accountNumber,
        amount: withdrawal.amount,
        narration: `FUNAAB BetSim withdrawal ${String(withdrawal.id).slice(0, 8)}`,
        reference: `WD-${withdrawal.id}`,
        beneficiary_name: withdrawal.accountName,
      });
      flwTransferId = String(transfer.id);
      await wRef.update({
        flwTransferId,
        status: "processing",
        updatedAt: Date.now(),
        adminNote: note ?? withdrawal.adminNote ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      // Unclear whether FLW created the transfer — do not assume failure forever.
      // Mark payment_failed so admin can Reject (release) or Reconcile/retry.
      await wRef.update({
        status: "payment_failed",
        adminNote: msg.slice(0, 300),
        updatedAt: Date.now(),
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    await writeAdminAudit({
      adminUid: admin.uid,
      adminEmail: admin.email ?? null,
      action: "withdrawal_approve",
      targetType: "withdrawal",
      targetId: withdrawalId,
      meta: {
        mode: "flutterwave",
        event: "transfer_requested",
        flwTransferId,
        amount: withdrawal.amount,
        uid: withdrawal.uid,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "flutterwave",
      status: "processing",
      flwTransferId,
      message:
        "Transfer requested. Status stays processing until Reconcile shows SUCCESSFUL.",
    });
  }

  // ---- Manual: you already paid outside the app → complete now ----
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
        flwTransferId: null,
        adminNote: note ?? w.adminNote,
        updatedAt: now,
        completedAt: now,
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
          withdrawalId: w.id,
          referenceId: w.id,
          now,
        })
      );

      const trRef = adminDb.collection("transactions").doc();
      tx.set(trRef, {
        id: trRef.id,
        uid: w.uid,
        type: "WITHDRAWAL_COMPLETED",
        amount: -w.amount,
        balanceBefore: wallet.balance,
        balanceAfter: next.balance,
        betId: null,
        status: "success",
        referenceId: w.id,
        createdAt: now,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Complete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const email = await resolveUserEmail(withdrawal.uid);
    if (email) {
      const tpl = withdrawalEmailHtml({
        status: "completed",
        amount: withdrawal.amount,
      });
      void sendMail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    }
  } catch (e) {
    console.error("withdrawal email failed", e);
  }

  await writeAdminAudit({
    adminUid: admin.uid,
    adminEmail: admin.email ?? null,
    action: "withdrawal_approve",
    targetType: "withdrawal",
    targetId: withdrawalId,
    meta: {
      mode: "manual",
      amount: withdrawal.amount,
      uid: withdrawal.uid,
    },
  });

  return NextResponse.json({
    ok: true,
    mode: "manual",
    status: "completed",
    flwTransferId: null,
  });
}
  
