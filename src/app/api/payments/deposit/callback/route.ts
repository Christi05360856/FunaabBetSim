import { NextResponse, type NextRequest } from "next/server";
import {
  flutterwaveVerifyByReference,
  flutterwaveVerifyTransaction,
} from "@/lib/payments/flutterwave";
import { creditVerifiedDeposit } from "@/lib/domain/creditDeposit";

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

  const origin =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://funaab-betsim.vercel.app";

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

    const okStatus =
      verified.status === "successful" || verified.status === "success";

    if (!okStatus) {
      return dash(
        `deposit=failed&reason=${encodeURIComponent("flw_" + verified.status)}&ref=${encodeURIComponent(txRef)}`
      );
    }

    if (String(verified.tx_ref) !== String(txRef)) {
      return dash(
        `deposit=failed&reason=${encodeURIComponent("tx_ref_mismatch")}&ref=${encodeURIComponent(txRef)}`
      );
    }

    if (String(verified.currency).toUpperCase() !== "NGN") {
      return dash(
        `deposit=failed&reason=${encodeURIComponent("currency")}&ref=${encodeURIComponent(txRef)}`
      );
    }

    const amountNgn = Math.round(
      Number(verified.charged_amount ?? verified.amount)
    );

    const result = await creditVerifiedDeposit({
      txRef: String(verified.tx_ref),
      flwTransactionId: String(verified.id),
      flwRef: String(verified.flw_ref ?? ""),
      amountNgn,
      currency: "NGN",
    });

    if (result.credited) {
      return dash(
        `deposit=success&points=${result.points}&ref=${encodeURIComponent(txRef)}`
      );
    }

    // already_credited still counts as success for the user
    if (result.reason === "already_credited") {
      return dash(
        `deposit=success&points=${result.points}&ref=${encodeURIComponent(txRef)}`
      );
    }

    return dash(
      `deposit=failed&reason=${encodeURIComponent(result.reason ?? "credit_failed")}&ref=${encodeURIComponent(txRef)}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify_error";
    return dash(
      `deposit=failed&reason=${encodeURIComponent(msg.slice(0, 120))}&ref=${encodeURIComponent(txRef)}`
    );
  }
}
