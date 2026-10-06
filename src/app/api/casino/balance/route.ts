import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import {
  ensureCasinoDemoWallet,
  reloadAvailability,
} from "@/lib/casino/demoWallet";
import {
  CASINO_RELOAD_CHIPS,
  CASINO_RELOAD_COOLDOWN_MS,
  CASINO_START_CHIPS,
} from "@/types/casino";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const wallet = await ensureCasinoDemoWallet(decoded.uid);
    const avail = reloadAvailability(wallet);
    return NextResponse.json({
      ok: true,
      balance: wallet.balance,
      startedAt: wallet.startedAt,
      lastReloadAt: wallet.lastReloadAt,
      canReload: avail.canReload,
      reloadReason: avail.reason,
      retryAfterMs: avail.retryAfterMs,
      constants: {
        startChips: CASINO_START_CHIPS,
        reloadChips: CASINO_RELOAD_CHIPS,
        reloadCooldownMs: CASINO_RELOAD_COOLDOWN_MS,
      },
    });
  } catch (e) {
    console.error("[casino/balance]", e);
    return NextResponse.json({ error: "Failed to load demo balance" }, { status: 500 });
  }
}
