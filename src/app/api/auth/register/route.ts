import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { STARTING_BALANCE } from "@/types/domain";

const bodySchema = z.object({
  displayName: z.string().trim().min(2).max(60),
});

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { uid, email } = decoded;
  const now = Date.now();
  const userRef = adminDb.collection("users").doc(uid);
  const walletRef = adminDb.collection("wallets").doc(uid);

  // Idempotent: if this account was already provisioned (e.g. the client
  // retried the request), do nothing rather than resetting the wallet.
  await adminDb.runTransaction(async (tx) => {
    const existingWallet = await tx.get(walletRef);
    if (existingWallet.exists) return;

    tx.set(userRef, {
      uid,
      email: email ?? "",
      displayName: parsed.data.displayName,
      role: "user",
      createdAt: now,
    });

    tx.set(walletRef, {
      uid,
      balance: STARTING_BALANCE,
      lifetimeWagering: 0,
      resetPendingSince: null,
      updatedAt: now,
    });
  });

  return NextResponse.json({ ok: true });
}
