import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  flutterwaveInitializePayment,
} from "@/lib/payments/flutterwave";
import { MIN_DEPOSIT_NGN, POINTS_PER_NAIRA } from "@/types/domain";
import type { Deposit } from "@/types/domain";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";

const bodySchema = z.object({
  amountNgn: z.number().finite().min(MIN_DEPOSIT_NGN).max(500_000),
  promoCode: z.string().trim().max(32).optional().nullable(),
});

function makeTxRef(uid: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `FB-${uid.slice(0, 6)}-${Date.now()}-${rand}`;
}

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);
  const limited = await enforceRateLimit("deposit_init", `uid:${decoded.uid}`);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          `Minimum deposit is ₦${MIN_DEPOSIT_NGN}`,
      },
      { status: 400 }
    );
  }

  const { amountNgn, promoCode } = parsed.data;
  const amount = Math.round(amountNgn);
  if (amount < MIN_DEPOSIT_NGN) {
    return NextResponse.json(
      { error: `Minimum deposit is ₦${MIN_DEPOSIT_NGN}` },
      { status: 400 }
    );
  }

  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://funaab-betsim.vercel.app";

  const txRef = makeTxRef(decoded.uid);
  const now = Date.now();
  const points = Math.round(amount * POINTS_PER_NAIRA);

  const deposit: Deposit = {
    id: txRef,
    txRef,
    uid: decoded.uid,
    amountNgn: amount,
    points,
    promoCode: promoCode?.toUpperCase() || null,
    status: "initiated",
    flwTransactionId: null,
    flwRef: null,
    createdAt: now,
    completedAt: null,
  };

  await adminDb.collection("deposits").doc(txRef).set(deposit);

  try {
    const { link } = await flutterwaveInitializePayment({
      tx_ref: txRef,
      amount,
      currency: "NGN",
      redirect_url: `${origin}/api/payments/deposit/callback`,
      customer: {
        email: decoded.email || `${decoded.uid}@users.funaab-betsim.local`,
        name: decoded.name || undefined,
      },
      customizations: {
        title: "FUNAAB BetSim",
        description: `Buy ${points} points`,
      },
      meta: {
        uid: decoded.uid,
        points: String(points),
      },
    });

    await adminDb.collection("deposits").doc(txRef).update({
      status: "pending",
    });

    void securityLog({
      type: "DEPOSIT_INIT",
      uid: decoded.uid,
      ip,
      meta: { amount },
    });

    return NextResponse.json({ ok: true, txRef, checkoutUrl: link, points });
  } catch (err) {
    await adminDb.collection("deposits").doc(txRef).update({
      status: "failed",
    });
    const message =
      err instanceof Error ? err.message : "Could not start payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
