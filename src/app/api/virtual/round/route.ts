import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { createVirtualRound, getVirtualRound } from "@/lib/virtual/rounds";
import { publicMatch } from "@/lib/virtual/engine";
import { ensureCasinoDemoWallet } from "@/lib/casino/demoWallet";

export const dynamic = "force-dynamic";

/** POST — deal a new Instant Virtual board + demo balance. */
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);
  const limited = await enforceRateLimit(
    "book_code",
    `virt_round:${decoded.uid}:${ip}`
  );
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    void body; // league is filtered client-side from full board

    const { public: pub } = await createVirtualRound();
    const wallet = await ensureCasinoDemoWallet(decoded.uid);

    return NextResponse.json({
      ok: true,
      round: pub,
      balance: wallet.balance,
    });
  } catch (e) {
    console.error("[virtual/round POST]", e);
    return NextResponse.json(
      { error: "Could not create virtual round" },
      { status: 500 }
    );
  }
}

/** GET ?id= — re-fetch an existing public board. */
export async function GET(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing round id" }, { status: 400 });
  }

  const stored = await getVirtualRound(id);
  if (!stored) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (Date.now() > stored.expiresAt) {
    return NextResponse.json(
      { error: "Round expired — deal a new board" },
      { status: 410 }
    );
  }

  const wallet = await ensureCasinoDemoWallet(decoded.uid);

  return NextResponse.json({
    ok: true,
    round: {
      id: stored.id,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      matches: stored.matches.map(publicMatch),
    },
    balance: wallet.balance,
  });
}
