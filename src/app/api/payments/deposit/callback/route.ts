import { NextResponse, type NextRequest } from "next/server";
import {
  flutterwaveVerifyByReference,
  flutterwaveVerifyTransaction,
} from "@/lib/payments/flutterwave";
import { creditVerifiedDeposit } from "@/lib/domain/creditDeposit";
import { evaluateFlutterwavePayment } from "@/lib/payments/verifyDeposit";
import { appBaseUrl } from "@/lib/config/appUrl";
import { resolveUserEmail, sendMail } from "@/lib/email/send";
import { depositEmailHtml } from "@/lib/email/templates";

/**
 * Browser redirect after checkout.
 * Always re-verify via Flutterwave API before crediting.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") ?? "").toLowerCase();
  const txRef = searchParams.get("tx_ref") ?? searchParams.get("txRef");
  const transactionId =
    searchParams.get("transaction_id") ?? searchParams.get("transactionId");

  const origin = appBaseUrl();

  const dash = (q: string) =>
    NextResponse.redirect(`${origin}/dashboard?${q}`);

  // User cancelled
  if (status === "cancelled" || status === "canceled") {
    return dash(
      `deposit=failed&reason=${encodeURIComponent("cancelled")}&ref=${encodeURIComponent(txRef ?? "")}`
    );
  }

  if (!txRef) {
    return dash(`deposit=failed&reason=${encodeURIComponent("missing_tx_ref")}`);
  }

  try {
    // Prefer verify by id; fall back to tx_ref (some test redirects omit id)
    let verified;
    if (transactionId) {
      verified = await flutterwaveVerifyTransaction(transactionId);
    } else {
      verified = await flutterwaveVerifyByReference(txRef);
    }

    const check = evaluateFlutterwavePayment(verified, txRef);
    if (!check.ok) {
      return dash(
        `deposit=failed&reason=${encodeURIComponent(check.reason)}&ref=${encodeURIComponent(txRef)}`
      );
    }
    const amountNgn = check.amountNgn;

    const result = await creditVerifiedDeposit({
      txRef: String(verified.tx_ref),
      flwTransactionId: String(verified.id),
      flwRef: String(verified.flw_ref ?? ""),
      amountNgn,
      currency: "NGN",
    });

    if (result.credited || result.reason === "already_credited") {
      // Email on browser callback (webhook may never fire in test)
      if (result.credited && result.uid) {
        try {
          const email = await resolveUserEmail(result.uid);
          if (email) {
            const tpl = depositEmailHtml({
              points: result.points,
              amountNgn,
              promoPoints: result.promoPoints,
              txRef: String(txRef),
            });
            void sendMail({
              to: email,
              subject: tpl.subject,
              html: tpl.html,
              text: tpl.text,
            });
          }
        } catch (e) {
          console.error("[email] deposit callback", e);
        }
      }
      return dash(
        `deposit=success&points=${result.points}&ref=${encodeURIComponent(txRef)}`
      );
    }

    return dash(
      `deposit=failed&reason=${encodeURIComponent(result.reason ?? "credit_failed")}&ref=${encodeURIComponent(txRef)}`
    );
  } catch (err) {
    console.error("deposit callback error", err);
    return dash(
      `deposit=failed&reason=${encodeURIComponent("verify_error")}&ref=${encodeURIComponent(txRef)}`
    );
  }
}
