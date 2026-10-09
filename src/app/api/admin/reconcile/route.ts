import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { findWalletViolations } from "@/lib/domain/walletChecks";
import type { Bet, Wallet } from "@/types/domain";

/**
 * Read-only wallet integrity report (admin only).
 * GET /api/admin/reconcile?limit=100&after=<uid>
 * Checks every wallet's buckets, its cached balance, and that its stake locks
 * match the user's open bets. Changes nothing.
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Number(searchParams.get("limit")) || 100)
  );
  const after = searchParams.get("after")?.trim() || "";

  try {
    let q = adminDb.collection("wallets").orderBy("__name__").limit(limit);
    if (after) q = q.startAfter(after);
    const snap = await q.get();

    const problems: {
      uid: string;
      issues: { code: string; detail: string }[];
    }[] = [];

    const docs = snap.docs;
    const chunk = 20;
    for (let i = 0; i < docs.length; i += chunk) {
      const slice = docs.slice(i, i + chunk);
      await Promise.all(
        slice.map(async (d) => {
          const wallet = d.data() as Wallet;
          // uid-only query avoids needing a composite index; filter in memory
          const betsSnap = await adminDb
            .collection("bets")
            .where("uid", "==", d.id)
            .limit(1000)
            .get();
          let openStake = 0;
          let openPromoStake = 0;
          betsSnap.forEach((b) => {
            const bet = b.data() as Bet;
            if (bet.status === "open") {
              openStake += Number(bet.stake) || 0;
              openPromoStake += Number(bet.stakePromo) || 0;
            }
          });
          const issues = findWalletViolations(wallet, {
            openStake,
            openPromoStake,
          });
          if (issues.length > 0) problems.push({ uid: d.id, issues });
        })
      );
    }

    const last = docs[docs.length - 1];
    return NextResponse.json({
      ok: true,
      checked: docs.length,
      problems,
      nextCursor: docs.length === limit && last ? last.id : null,
    });
  } catch (err) {
    console.error("reconcile error", err);
    return NextResponse.json(
      { error: "Reconciliation failed. Check the server logs." },
      { status: 500 }
    );
  }
}
