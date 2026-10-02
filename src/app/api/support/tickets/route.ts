import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { enforceRateLimit } from "@/lib/security/rateLimit";

/**
 * User support tickets.
 * GET  — list own tickets (newest first)
 * POST — create ticket { subject, body }
 *
 * Path: src/app/api/support/tickets/route.ts
 */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Equality only — sort in memory (no composite index required)
  const snap = await adminDb
    .collection("support_tickets")
    .where("uid", "==", user.uid)
    .limit(40)
    .get();

  const items = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        subject: x.subject as string,
        body: x.body as string,
        status: x.status as string,
        createdAt: Number(x.createdAt) || 0,
        updatedAt: Number(x.updatedAt) || 0,
        adminNote: (x.adminNote as string | null) ?? null,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30);

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await enforceRateLimit("support_ticket", `uid:${user.uid}`);
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    body?: string;
  };
  const subject = String(body.subject ?? "").trim().slice(0, 120);
  const message = String(body.body ?? "").trim().slice(0, 2000);

  if (subject.length < 3) {
    return NextResponse.json(
      { error: "Subject must be at least 3 characters" },
      { status: 400 }
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error: "Message must be at least 10 characters" },
      { status: 400 }
    );
  }

  const now = Date.now();
  const ref = adminDb.collection("support_tickets").doc();
  const doc = {
    id: ref.id,
    uid: user.uid,
    email: user.email ?? null,
    subject,
    body: message,
    status: "open" as const,
    adminNote: null as string | null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);

  return NextResponse.json({ ok: true, id: ref.id });
}
