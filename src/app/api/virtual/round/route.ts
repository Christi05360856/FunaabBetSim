import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { createVirtualRound, getVirtualRound } from "@/lib/virtual/rounds";
import { publicMatch } from "@/lib/virtual/engine";

export const dynamic = "force-dynamic";

/** POST — create a new Instant Virtual board (demo). */
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = clientIp(request);
  const limited = await enforceRateLimit("book_code", `virt_round:${decoded.uid}:${ip}`);
  if (limited) return limited;

  try {
    const { public: pub } = await createVirtualRound();
    return NextResponse.json({ ok: true, round: pub });
  } catch {
    return NextResponse.json(
      { error: "Could not create virtual round" },
      { status: 500 }
    );
  }
}

/** GET ?id= — fetch public board (no strengths). */
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
    return NextResponse.json({ error: "Round expired — deal a new board" }, { status: 410 });
  }
  return NextResponse.json({
    ok: true,
    round: {
      id: stored.id,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      matches: stored.matches.map(publicMatch),
    },
  });
}
