import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Deposit } from "@/types/domain";

/**
 * GET /api/admin/deposits?status=all|success|initiated|pending|failed
 * Lists recent deposits for support (missed credits, disputes).
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = (request.nextUrl.searchParams.get("status") ?? "all").trim();

  try {
    // Prefer createdAt desc; if index missing, fall back to unordered + sort
    let snap;
    try {
      snap = await adminDb
        .collection("deposits")
        .orderBy("createdAt", "desc")
        .limit(300)
        .get();
    } catch {
      snap = await adminDb.collection("deposits").limit(300).get();
    }

    let items = snap.docs.map((d) => {
      const data = d.data() as Deposit;
      return {
        id: d.id,
        txRef: data.txRef ?? d.id,
        uid: data.uid,
        amountNgn: Number(data.amountNgn) || 0,
        points: Number(data.points) || 0,
        promoCode: data.promoCode ?? null,
        status: data.status,
        flwTransactionId: data.flwTransactionId ?? null,
        flwRef: data.flwRef ?? null,
        createdAt: Number(data.createdAt) || 0,
        completedAt: data.completedAt ?? null,
        recovered: Boolean((data as { recovered?: boolean }).recovered),
      };
    });

    items.sort((a, b) => b.createdAt - a.createdAt);

    if (status !== "all") {
      items = items.filter((d) => d.status === status);
    }

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("admin deposits list", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "List failed" },
      { status: 500 }
    );
  }
}
