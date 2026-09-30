import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { emptyWallet } from "@/lib/domain/wallet";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";

const bodySchema = z.object({
  displayName: z.string().trim().min(2).max(60),
});

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);
  const limited = await enforceRateLimit("register", `uid:${decoded.uid}`);
  if (limited) return limited;
  const limitedIp = await enforceRateLimit("register", `ip:${ip}`);
  if (limitedIp) return limitedIp;

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

  void securityLog({ type: "AUTH_REGISTER", uid, ip });

  return NextResponse.json({ ok: true });
}
