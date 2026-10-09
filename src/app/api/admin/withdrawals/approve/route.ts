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

  const totpErr = await requireAdminTotpOnce((body as { totpCode?: string }).totpCode);
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }

  if (!withdrawalId) {
    return NextResponse.json({ error: "withdrawalId required" }, { status: 400 });
  }

  const wRef = adminDb.collection("withdrawals").doc(withdrawalId);

  // H-03: atomically claim → processing before any provider call
  let withdrawal: Withdrawal;
  try {
    withdrawal = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(wRef);
      if (!snap.exists) throw new Error("Not found");
      const w = snap.data() as Withdrawal;
      if (w.status === "completed" || w.status === "processing") {
        throw new Error(`Already ${w.status}`);
      }
      if (w.status === "rejected") {
        throw new Error("Already rejected");
      }
      if (
        w.status !== "pending_review" &&
        w.status !== "approved" &&
        w.status !== "payment_failed"
      ) {
        throw new Error(`Cannot approve status ${w.status}`);
      }
      const now = Date.now();
      tx.update(wRef, {
        status: "processing",
        updatedAt: now,
        adminNote: note,
        providerReference: `WD-${w.id}`,
      });
      return { ...w, status: "processing" as const };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Claim failed";
    const status = msg === "Not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  let flwTransferId: string | null = withdrawal.flwTransferId ?? null;

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

  await writeAdminAudit({
    adminUid: admin.uid,
    adminEmail: admin.email ?? null,
    action: "withdrawal_approve",
    targetType: "withdrawal",
    targetId: withdrawalId,
    meta: { mode, flwTransferId, amount: withdrawal.amount, uid: withdrawal.uid },
  });

  return NextResponse.json({
    ok: true,
    mode,
    flwTransferId,
  });
        }
