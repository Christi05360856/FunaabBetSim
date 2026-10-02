import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyWithdrawalReject,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import type { Wallet, Withdrawal } from "@/types/domain";
import { requireAdminTotp } from "@/lib/security/adminTotp";
import { resolveUserEmail, sendMail } from "@/lib/email/send";
import { withdrawalEmailHtml } from "@/lib/email/templates";

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const withdrawalId = String(body.withdrawalId ?? "").trim();
  const note = body.note != null ? String(body.note).slice(0, 300) : "Rejected by admin";

  const totpErr = requireAdminTotp((body as { totpCode?: string }).totpCode);
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }

  if (!withdrawalId) {
    return NextResponse.json({ error: "withdrawalId required" }, { status: 400 });
  }

  let mailUid: string | null = null;
  let mailAmount = 0;

  try {
    await adminDb.runTransaction(async (tx) => {
      const wRef = adminDb.collection("withdrawals").doc(withdrawalId);
      const wSnap = await tx.get(wRef);
      if (!wSnap.exists) throw new Error("Not found");
      const w = wSnap.data() as Withdrawal;
      mailUid = w.uid;
      mailAmount = w.amount;

      if (w.status === "completed" || w.status === "rejected") {
        throw new Error(`Already ${w.status}`);
      }

      const walletRef = adminDb.collection("wallets").doc(w.uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error("Wallet missing");
      const wallet = normalizeWallet(walletSnap.data() as Wallet);
      const next = applyWithdrawalReject(wallet, w.amount);
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
        status: "rejected",
        adminNote: note,
        updatedAt: now,
      });

      const ledRef = adminDb.collection("ledger").doc();
      tx.set(
        ledRef,
        buildLedgerEntry({
          id: ledRef.id,
          uid: w.uid,
          type: "WITHDRAWAL_REJECTED",
          amount: 0,
          balanceBefore: wallet.balance,
          balanceAfter: next.balance,
          withdrawalId: w.id,
          referenceId: w.id,
          metadata: { note },
          now,
        })
      );

      const trRef = adminDb.collection("transactions").doc();
      tx.set(trRef, {
        id: trRef.id,
        uid: w.uid,
        type: "WITHDRAWAL_REJECTED",
        amount: 0,
        balanceBefore: wallet.balance,
        balanceAfter: next.balance,
        betId: null,
        status: "failed",
        referenceId: w.id,
        createdAt: now,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reject failed";
    const status = msg === "Not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  if (mailUid) {
    try {
      const email = await resolveUserEmail(mailUid);
      if (email) {
        const tpl = withdrawalEmailHtml({
          status: "rejected",
          amount: mailAmount,
          note,
        });
        void sendMail({
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
      }
    } catch (e) {
      console.error("withdrawal reject email failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}
