import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { reloadCasinoDemoWallet } from "@/lib/casino/demoWallet";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reloadCasinoDemoWallet(decoded.uid);
    if (!result.ok) {
      const status = result.code === "COOLDOWN" ? 429 : 400;
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          balance: result.wallet?.balance ?? 0,
          retryAfterMs: result.retryAfterMs ?? 0,
        },
        { status }
      );
    }
    return NextResponse.json({
      ok: true,
      balance: result.wallet.balance,
      credited: result.credited,
      lastReloadAt: result.wallet.lastReloadAt,
    });
  } catch (e) {
    console.error("[casino/reload]", e);
    return NextResponse.json({ error: "Reload failed" }, { status: 500 });
  }
}
