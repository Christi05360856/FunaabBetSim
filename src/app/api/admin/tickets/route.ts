import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";

/**
 * Admin tickets.
 * GET  — list recent tickets (optional ?status=open|in_progress|closed)
 * PATCH — { id, status?, adminNote? }
 *
 * Path: src/app/api/admin/tickets/route.ts
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  let q = adminDb
    .collection("support_tickets")
    .orderBy("createdAt", "desc")
    .limit(50);

  // Filter in memory if status set (avoids composite index requirement for MVP)
  const snap = await q.get();
  let items = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      uid: x.uid,
      email: x.email ?? null,
      subject: x.subject,
      body: x.body,
      status: x.status,
      adminNote: x.adminNote ?? null,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
    };
  });

  if (status && ["open", "in_progress", "closed"].includes(status)) {
    items = items.filter((t) => t.status === status);
  }

  return NextResponse.json({ items });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    adminNote?: string;
  };
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const ref = adminDb.collection("support_tickets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.status && ["open", "in_progress", "closed"].includes(body.status)) {
    patch.status = body.status;
  }
  if (typeof body.adminNote === "string") {
    patch.adminNote = body.adminNote.trim().slice(0, 500);
  }

  await ref.update(patch);
  return NextResponse.json({ ok: true });
}
