import { NextResponse, type NextRequest } from "next/server";
import { flutterwaveVerifyTransaction } from "@/lib/payments/flutterwave";
import { creditVerifiedDeposit } from "@/lib/domain/creditDeposit";

/**
 * Browser redirect after checkout. Re-verifies server-side; does not trust query alone.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const txRef = searchParams.get("tx_ref");
  const transactionId = searchParams.get("transaction_id");

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || "https://funaab-betsim.vercel.app";

  if (status !== "successful" || !txRef || !transactionId) {
    return NextResponse.redirect(
      `${origin}/account?deposit=failed&ref=${encodeURIComponent(txRef ?? "")}`
    );
  }

  try {
    const verified = await flutterwaveVerifyTransaction(transactionId);
    if (
      verified.status !== "successful" ||
      verified.currency !== "NGN" ||
      verified.tx_ref !== txRef
    ) {
      return NextResponse.redirect(
        `${origin}/account?deposit=failed&ref=${encodeURIComponent(txRef)}`
      );
    }

    const result = await creditVerifiedDeposit({
      txRef: verified.tx_ref,
      flwTransactionId: String(verified.id),
      flwRef: verified.flw_ref,
      amountNgn: verified.amount,
      currency: verified.currency,
    });

    const q = result.credited
      ? `deposit=success&points=${result.points}`
      : `deposit=ok&reason=${encodeURIComponent(result.reason ?? "noop")}`;

    return NextResponse.redirect(`${origin}/account?${q}&ref=${encodeURIComponent(txRef)}`);
  } catch {
    return NextResponse.redirect(
      `${origin}/account?deposit=failed&ref=${encodeURIComponent(txRef)}`
    );
  }
}
