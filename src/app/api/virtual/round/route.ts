import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { ensureCasinoDemoWallet } from "@/lib/casino/demoWallet";
import { buildCurrentRound } from "@/lib/virtual/currentRound";

export const dynamic = "force-dynamic";

/** GET — shared current virtual board (same for every player). */
export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { public: round } = buildCurrentRound();
    const wallet = await ensureCasinoDemoWallet(decoded.uid);
    return NextResponse.json({
      ok: true,
      round,
      balance: wallet.balance,
    });
  } catch (e) {
    console.error("[virtual/round]", e);
    return NextResponse.json({ error: "Failed to load round" }, { status: 500 });
  }
}
