import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Promotion } from "@/types/domain";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb.collection("promotions").orderBy("createdAt", "desc").limit(50).get();
  const items = snap.docs.map((d) => d.data() as Promotion);
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ""));
  const bonusPoints = Math.round(Number(body.bonusPoints));
  const maxRedemptions = Math.round(Number(body.maxRedemptions));
  const minDepositNgn = Math.round(Number(body.minDepositNgn ?? 200));
  const active = body.active !== false;

  if (!code || code.length < 3) {
    return NextResponse.json({ error: "Code must be at least 3 characters" }, { status: 400 });
  }
  if (!Number.isFinite(bonusPoints) || bonusPoints < 1) {
    return NextResponse.json({ error: "bonusPoints must be ≥ 1" }, { status: 400 });
  }
  if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1) {
    return NextResponse.json({ error: "maxRedemptions must be ≥ 1" }, { status: 400 });
  }

  const ref = adminDb.collection("promotions").doc(code);
  const existing = await ref.get();
  if (existing.exists) {
    return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  }

  const now = Date.now();
  const promo: Promotion = {
    id: code,
    code,
    ruleType: "welcome_fixed",
    bonusPoints,
    minDepositNgn: minDepositNgn > 0 ? minDepositNgn : 200,
    maxRedemptions,
    redemptionCount: 0,
    active,
    exhaustedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(promo);
  return NextResponse.json({ ok: true, promo });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ""));
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const ref = adminDb.collection("promotions").doc(code);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.bonusPoints != null) updates.bonusPoints = Math.round(Number(body.bonusPoints));
  if (body.maxRedemptions != null)
    updates.maxRedemptions = Math.round(Number(body.maxRedemptions));
  if (body.minDepositNgn != null)
    updates.minDepositNgn = Math.round(Number(body.minDepositNgn));

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}
