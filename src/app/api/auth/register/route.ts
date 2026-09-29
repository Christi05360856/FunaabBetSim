import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { emptyWallet } from "@/lib/domain/wallet";

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

  // Idempotent: if this account was already provisioned, do not reset balances.
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

    tx.set(walletRef, emptyWallet(uid, now));
  });

  return NextResponse.json({ ok: true });
}
