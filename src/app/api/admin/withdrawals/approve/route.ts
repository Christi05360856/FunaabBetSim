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
import { requireAdminTotp } from "@/lib/security/adminTotp";
import { resolveUserEmail, sendMail } from "@/lib/email/send";
import { withdrawalEmailHtml } from "@/lib/email/templates";

/**
 * body: { withdrawalId, mode: "manual" | "flutterwave", note? }
 * manual = mark paid after you sent money outside the app
 * flutterwave = attempt API transfer then mark completed
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

  const totpErr = requireAdminTotp((body as { totpCode?: string }).totpCode);
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }

  if (!withdrawalId) {
    return NextResponse.json({ error: "withdrawalId required" }, { status: 400 });
  }

  const wRef = adminDb.collection("withdrawals").doc(withdrawalId);
  const wSnap = await wRef.get();
  if (!wSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const withdrawal = wSnap.data() as Withdrawal;
  if (
    withdrawal.status !== "pending_review" &&
    withdrawal.status !== "approved" &&
    withdrawal.status !== "payment_failed"
  ) {
    return NextResponse.json(
      { error: `Cannot approve status ${withdrawal.status}` },
      { status: 400 }
    );
  }

  let flwTransferId: string | null = withdrawal.flwTransferId;

  if (mode === "flutterwave") {
    try {
      await wRef.update({
        status: "processing",
        updatedAt: Date.now(),
        adminNote: note,
      });
      const transfer = await flutterwaveTransfer({
        account_bank: withdrawal.bankCode,
        account_number: withdrawal.accountNumber,
        amount: withdrawal.amount,
        narration: `FUNAAB BetSim withdrawal ${withdrawal.id.slice(0, 8)}`,
        reference: `WD-${withdrawal.id}`,
        beneficiary_name: withdrawal.accountName,
      });
      flwTransferId = String(transfer.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      await wRef.update({
        status: "payment_failed",
        adminNote: msg.slice(0, 300),
        updatedAt: Date.now(),
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

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
        flwTransferId,
        adminNote: note ?? w.adminNote,
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
          withdrawalId: w.id,
          referenceId: flwTransferId ?? w.id,
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

  // P1 email
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

  return NextResponse.json({
    ok: true,
    mode,
    flwTransferId,
  });
}
