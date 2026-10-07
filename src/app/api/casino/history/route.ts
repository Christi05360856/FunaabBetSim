import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export type CasinoPlayRow = {
  id: string;
  game: string;
  stake: number;
  payout: number;
  profit: number;
  createdAt: number;
  won: boolean;
};

/**
 * GET /api/casino/history?limit=40&filter=all|wins|losses
 * Server-authoritative demo play log for the signed-in user only.
 */
export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filter = (searchParams.get("filter") || "all").toLowerCase();
  const limitRaw = Number(searchParams.get("limit") || "40");
  const limit = Math.min(80, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 40));

  try {
    let snap;
    try {
      snap = await adminDb
        .collection("casino_plays")
        .where("uid", "==", decoded.uid)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
    } catch {
      // Fallback if composite index is missing — still scoped to uid
      snap = await adminDb
        .collection("casino_plays")
        .where("uid", "==", decoded.uid)
        .limit(limit)
        .get();
    }

    let rows: CasinoPlayRow[] = snap.docs.map((d) => {
      const data = d.data() as {
        game?: string;
        stake?: number;
        payout?: number;
        profit?: number;
        createdAt?: number;
        meta?: { won?: boolean };
      };
      const stake = Math.floor(Number(data.stake) || 0);
      const payout = Math.floor(Number(data.payout) || 0);
      const profit =
        typeof data.profit === "number"
          ? Math.floor(data.profit)
          : payout - stake;
      const won =
        typeof data.meta?.won === "boolean" ? data.meta.won : payout > stake;
      return {
        id: d.id,
        game: String(data.game || "unknown"),
        stake,
        payout,
        profit,
        createdAt: Number(data.createdAt) || 0,
        won,
      };
    });

    rows.sort((a, b) => b.createdAt - a.createdAt);

    if (filter === "wins") rows = rows.filter((r) => r.won);
    else if (filter === "losses") rows = rows.filter((r) => !r.won);

    const allForStats = rows; // stats from current page is weak; better recompute from unfiltered
    // Re-fetch stats from unfiltered set when filter applied
    let statsSource = rows;
    if (filter !== "all") {
      try {
        const allSnap = await adminDb
          .collection("casino_plays")
          .where("uid", "==", decoded.uid)
          .orderBy("createdAt", "desc")
          .limit(80)
          .get();
        statsSource = allSnap.docs.map((d) => {
          const data = d.data() as {
            stake?: number;
            payout?: number;
            profit?: number;
            meta?: { won?: boolean };
          };
          const stake = Math.floor(Number(data.stake) || 0);
          const payout = Math.floor(Number(data.payout) || 0);
          const profit =
            typeof data.profit === "number"
              ? Math.floor(data.profit)
              : payout - stake;
          const won =
            typeof data.meta?.won === "boolean"
              ? data.meta.won
              : payout > stake;
          return {
            id: d.id,
            game: "",
            stake,
            payout,
            profit,
            createdAt: 0,
            won,
          };
        });
      } catch {
        statsSource = rows;
      }
    }

    const plays = statsSource.length;
    const wins = statsSource.filter((r) => r.won).length;
    const losses = plays - wins;
    const net = statsSource.reduce((s, r) => s + r.profit, 0);

    return NextResponse.json({
      ok: true,
      plays: rows,
      stats: { plays, wins, losses, net },
    });
  } catch (e) {
    console.error("[casino/history]", e);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
