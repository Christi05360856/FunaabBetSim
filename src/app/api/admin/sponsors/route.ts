import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";

export type Sponsor = {
  id: string;
  name: string;
  logoUrl: string | null;
  linkUrl: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb.collection("sponsors").orderBy("sortOrder", "asc").limit(40).get();
  const items = snap.docs.map((d) => d.data() as Sponsor);
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const logoUrl = body.logoUrl ? String(body.logoUrl).trim() : null;
  const linkUrl = body.linkUrl ? String(body.linkUrl).trim() : null;
  const sortOrder = Number(body.sortOrder ?? 0) || 0;

  if (name.length < 2) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const now = Date.now();
  const ref = adminDb.collection("sponsors").doc();
  const row: Sponsor = {
    id: ref.id,
    name,
    logoUrl,
    linkUrl,
    active: true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(row);
  return NextResponse.json({ ok: true, sponsor: row });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ref = adminDb.collection("sponsors").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.name != null) updates.name = String(body.name).trim();
  if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl ? String(body.logoUrl).trim() : null;
  if (body.linkUrl !== undefined) updates.linkUrl = body.linkUrl ? String(body.linkUrl).trim() : null;
  if (body.sortOrder != null) updates.sortOrder = Number(body.sortOrder) || 0;

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await adminDb.collection("sponsors").doc(id).delete();
  return NextResponse.json({ ok: true });
}
