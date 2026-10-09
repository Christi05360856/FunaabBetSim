import type { FlwVerifyData } from "@/lib/payments/flutterwave";

export type DepositVerification =
  | { ok: true; amountNgn: number }
  | { ok: false; reason: string };

/**
 * ONE place that decides whether a Flutterwave transaction counts as a valid
 * payment. Used by both the browser callback and the webhook so they can
 * never disagree.
 * Amount rule: use `amount` (what we asked to collect). `charged_amount` can
 * include customer-paid fees and would wrongly fail the amount check.
 */
export function evaluateFlutterwavePayment(
  v: FlwVerifyData,
  expectedTxRef: string
): DepositVerification {
  const status = String(v.status ?? "").toLowerCase();
  if (status !== "successful" && status !== "success") {
    return { ok: false, reason: `flw_${status || "unknown"}` };
  }
  if (String(v.tx_ref) !== String(expectedTxRef)) {
    return { ok: false, reason: "tx_ref_mismatch" };
  }
  if (String(v.currency ?? "").toUpperCase() !== "NGN") {
    return { ok: false, reason: "currency" };
  }
  const amount = Number(v.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "amount_invalid" };
  }
  return { ok: true, amountNgn: Math.round(amount) };
}
