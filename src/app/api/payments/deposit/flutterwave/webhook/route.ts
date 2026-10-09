import { NextResponse, type NextRequest } from "next/server";
import {
  flutterwaveVerifyTransaction,
  isValidFlutterwaveWebhook,
} from "@/lib/payments/flutterwave";
import { evaluateFlutterwavePayment } from "@/lib/payments/verifyDeposit";
import { creditVerifiedDeposit } from "@/lib/domain/creditDeposit";
import { adminDb } from "@/lib/firebase/admin";
import { resolveUserEmail, sendMail } from "@/lib/email/send";
import { depositEmailHtml } from "@/lib/email/templates";

/**
 * Flutterwave webhook. Always re-verify via API; never trust payload alone.
 * Idempotent credit via deposits/{tx_ref}.status === success.
 */
export async function POST(request: NextRequest) {
  const verif = request.headers.get("verif-hash");
  if (!isValidFlutterwaveWebhook(verif)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const data = (payload as { data?: Record<string, unknown> }).data;
  if (!data) {
    // Acknowledge unknown shapes so Flutterwave does not retry forever
    return NextResponse.json({ ok: true, ignored: true });
  }

  const status = String(data.status ?? "");
  const id = data.id;
  const txRef = String(data.tx_ref ?? "");

  if (!id || !txRef) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (status !== "successful") {
    return NextResponse.json({ ok: true, status });
  }

  // Audit every successful-looking webhook hit (idempotent key = FLW id)
  const eventRef = adminDb.collection("webhook_events").doc(`flw_${id}`);
  try {
    const prev = await eventRef.get();
    if (prev.exists && prev.data()?.processed === true) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        reason: prev.data()?.creditReason ?? "already_processed",
      });
    }
    await eventRef.set(
      {
        id: `flw_${id}`,
        provider: "flutterwave",
        txRef,
        status,
        receivedAt: Date.now(),
        processed: false,
      },
      { merge: true }
    );
  } catch (e) {
    console.error("webhook_events write failed", e);
  }

  try {
    const verified = await flutterwaveVerifyTransaction(id as number | string);
    const check = evaluateFlutterwavePayment(verified, txRef);
    if (!check.ok) {
      return NextResponse.json({ ok: true, verified: false, reason: check.reason });
    }

    const result = await creditVerifiedDeposit({
      txRef: verified.tx_ref,
      flwTransactionId: String(verified.id),
      flwRef: verified.flw_ref,
      amountNgn: check.amountNgn,
      currency: "NGN",
    });

    // P1: notify user (never block webhook success on email failure)
    if (result.credited) {
      try {
        const depSnap = await adminDb.collection("deposits").doc(verified.tx_ref).get();
        const uid = depSnap.exists ? String(depSnap.data()?.uid ?? "") : "";
        const email = uid ? await resolveUserEmail(uid) : null;
        if (email) {
          const amountNgn = check.amountNgn;
          const tpl = depositEmailHtml({
            points: result.points,
            amountNgn,
            promoPoints: result.promoPoints,
            txRef: verified.tx_ref,
          });
          void sendMail({
            to: email,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
          });
        }
      } catch (e) {
        console.error("deposit email failed", e);
      }
    }

    try {
      await eventRef.set(
        {
          processed: true,
          processedAt: Date.now(),
          credited: result.credited,
          creditReason: result.reason ?? null,
          points: result.points ?? null,
        },
        { merge: true }
      );
    } catch (e) {
      console.error("webhook_events finalize failed", e);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("flutterwave webhook error", err);
    // 500 → Flutterwave retries
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
