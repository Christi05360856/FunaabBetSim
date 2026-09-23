import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { RESET_COOLDOWN_MS, STARTING_BALANCE } from "@/types/domain";
import type { Transaction, Wallet } from "@/types/domain";

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = decoded.uid;
  const walletRef = adminDb.collection("wallets").doc(uid);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error("Wallet not found");
      const wallet = walletSnap.data() as Wallet;

      // Idempotent by construction: once reset succeeds, balance becomes
      // STARTING_BALANCE (not 0), so a retried/duplicate request lands here
      // and is correctly rejected — no separate "already reset" flag needed.
      if (wallet.balance !== 0) {
        throw new Error("Reset is only available at a zero balance");
      }
      if (wallet.resetPendingSince === null) {
        throw new Error("No reset is currently pending");
      }

      const now = Date.now();
      const elapsed = now - wallet.resetPendingSince;
      if (elapsed < RESET_COOLDOWN_MS) {
        const remainingMs = RESET_COOLDOWN_MS - elapsed;
        throw new Error(`Reset unlocks in ${Math.ceil(remainingMs / (60 * 1000))} minute(s)`);
      }

      tx.update(walletRef, {
        balance: STARTING_BALANCE,
        resetPendingSince: null,
        updatedAt: now,
      });

      const transactionRef = adminDb.collection("transactions").doc();
      const transaction: Transaction = {
        id: transactionRef.id,
        uid,
        type: "reset",
        amount: STARTING_BALANCE,
        balanceAfter: STARTING_BALANCE,
        betId: null,
        createdAt: now,
      };
      tx.set(transactionRef, transaction);

      return { balance: STARTING_BALANCE };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reset wallet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
