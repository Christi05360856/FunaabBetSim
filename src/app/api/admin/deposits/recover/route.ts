import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { requireAdminTotpOnce } from "@/lib/security/adminTotpGuard";
import { writeAdminAudit } from "@/lib/security/adminAudit";
import {
  flutterwaveVerifyByReference,
  flutterwaveVerifyTransaction,
} from "@/lib/payments/flutterwave";
import { evaluateFlutterwavePayment } from "@/lib/payments/verifyDeposit";
import { creditVerifiedDeposit } from "@/lib/domain/creditDeposit";
import { adminDb } from "@/lib/firebase/admin";

/**
 * POST { txRef?, flwTransactionId?, recoveryUid?, totpCode? }
 *
 * Support tool: user paid on Flutterwave but app did not credit.
 * Always re-verifies with Flutterwave. Never trusts admin-typed amount alone.
 * recoveryUid only used when deposit doc is missing (must match FLW meta when present).
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const totpErr = await requireAdminTotpOnce(
    (body as { totpCode?: string }).totpCode
  );
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }

  const txRef = String(body.txRef ?? body.tx_ref ?? "").trim();
  const flwId = String(
    body.flwTransactionId ?? body.transactionId ?? body.transaction_id ?? ""
  ).trim();
  const recoveryUidOverride = String(body.recoveryUid ?? "").trim() || null;

  if (!txRef && !flwId) {
    return NextResponse.json(
      { error: "Provide txRef (FB-…) and/or Flutterwave transaction id" },
      { status: 400 }
    );
  }

  try {
    let verified;
    if (flwId) {
      verified = await flutterwaveVerifyTransaction(flwId);
    } else {
      verified = await flutterwaveVerifyByReference(txRef);
    }

    const refToCheck = txRef || String(verified.tx_ref);
    const check = evaluateFlutterwavePayment(verified, refToCheck);
    if (!check.ok) {
      return NextResponse.json(
        {
          error: `Flutterwave did not confirm a successful NGN payment: ${check.reason}`,
          flwStatus: verified.status,
        },
        { status: 400 }
      );
    }

    const meta =
      verified.meta && typeof verified.meta === "object"
        ? (verified.meta as Record<string, unknown>)
        : null;
    const recoveryUid =
      recoveryUidOverride ||
      (meta && typeof meta.uid === "string" ? String(meta.uid) : null);

    // If deposit exists, recoveryUid is ignored (uid comes from deposit)
    if (!recoveryUid) {
      const dep = await adminDb.collection("deposits").doc(refToCheck).get();
      if (!dep.exists) {
        return NextResponse.json(
          {
            error:
              "Deposit doc missing and no uid in FLW meta. Pass recoveryUid (Firebase user id) after confirming the payer in Flutterwave dashboard.",
          },
          { status: 400 }
        );
      }
    }

    const result = await creditVerifiedDeposit({
      txRef: String(verified.tx_ref),
      flwTransactionId: String(verified.id),
      flwRef: String(verified.flw_ref ?? ""),
      amountNgn: check.amountNgn,
      currency: "NGN",
      recoveryUid,
      meta,
    });

    await writeAdminAudit({
      adminUid: admin.uid,
      adminEmail: admin.email ?? null,
      action: "deposit_recover",
      targetType: "deposit",
      targetId: String(verified.tx_ref),
      meta: {
        flwTransactionId: String(verified.id),
        amountNgn: check.amountNgn,
        credited: result.credited,
        reason: result.reason ?? null,
        recovered: result.recovered ?? false,
        uid: result.uid ?? recoveryUid,
      },
    });

    if (result.credited || result.reason === "already_credited") {
      return NextResponse.json({
        ok: true,
        credited: result.credited,
        alreadyCredited: result.reason === "already_credited",
        recovered: result.recovered ?? false,
        points: result.points,
        uid: result.uid,
        txRef: verified.tx_ref,
        message: result.credited
          ? `Credited ${result.points} points`
          : "Already credited earlier",
      });
    }

    return NextResponse.json(
      {
        error: result.reason ?? "credit_failed",
        uid: result.uid,
      },
      { status: 400 }
    );
  } catch (e) {
    console.error("deposit recover", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recover failed" },
      { status: 500 }
    );
  }
}
