import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";

const IDLE_MS = 60 * 60 * 1000;

type TicketMessage = {
  id: string;
  from: "user" | "admin" | "bot";
  body: string;
  createdAt: number;
};

/**
 * GET   — list tickets
 * PATCH — { id, status }
 * POST  — { id, body } admin reply
 *
 * Path: src/app/api/admin/tickets/route.ts
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  let snap;
  try {
    snap = await adminDb
      .collection("support_tickets")
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();
  } catch {
    snap = await adminDb
      .collection("support_tickets")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
  }

  const now = Date.now();
  const items = [];

  for (const d of snap.docs) {
    const data = d.data();
    await maybeIdleClose(d.ref, data, now);
    const x = (await d.ref.get()).data() ?? data;
    items.push({
      id: d.id,
      uid: x.uid as string,
      email: (x.email as string | null) ?? null,
      subject: x.subject as string,
      category: (x.category as string) || "other",
      status: x.status as string,
      closeReason: (x.closeReason as string | null) ?? null,
      createdAt: Number(x.createdAt) || 0,
      updatedAt: Number(x.updatedAt) || 0,
      messages: normalizeMessages(x.messages),
      body: typeof x.body === "string" ? x.body : undefined,
    });
  }

  let out = items;
  if (status && ["open", "in_progress", "closed"].includes(status)) {
    out = items.filter((t) => t.status === status);
  }

  return NextResponse.json({ items: out });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
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
    if (body.status === "closed") patch.closeReason = "admin";
    if (body.status !== "closed") patch.closeReason = null;
  }
  await ref.update(patch);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    body?: string;
  };
  const id = String(body.id ?? "").trim();
  const text = String(body.body ?? "").trim().slice(0, 2000);
  if (!id || text.length < 1) {
    return NextResponse.json(
      { error: "id and body required" },
      { status: 400 }
    );
  }

  const ref = adminDb.collection("support_tickets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = snap.data()!;
  const now = Date.now();
  await maybeIdleClose(ref, data, now);
  const fresh = (await ref.get()).data()!;
  if (fresh.status === "closed") {
    return NextResponse.json(
      { error: "Ticket is closed. Reopen it before replying." },
      { status: 400 }
    );
  }

  let messages = normalizeMessages(fresh.messages);
  if (messages.length === 0 && typeof fresh.body === "string" && fresh.body) {
    messages.push({
      id: `m_legacy_${fresh.createdAt || now}`,
      from: "user",
      body: String(fresh.body).slice(0, 2000),
      createdAt: Number(fresh.createdAt) || now,
    });
  }

  if (messages.length >= 80) {
    return NextResponse.json({ error: "Thread limit reached" }, { status: 400 });
  }

  messages.push({
    id: `m_${now}_${Math.random().toString(36).slice(2, 8)}`,
    from: "admin",
    body: text,
    createdAt: now,
  });

  await ref.update({
    messages,
    status: "in_progress",
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}

async function maybeIdleClose(
  ref: { update: (data: Record<string, unknown>) => Promise<unknown> },
  data: Record<string, unknown>,
  now: number
) {
  if (data.status === "closed") return;
  const last =
    Number(data.lastUserMessageAt) ||
    Number(data.updatedAt) ||
    Number(data.createdAt) ||
    0;
  if (!last || now - last < IDLE_MS) return;

  const messages = normalizeMessages(data.messages);
  messages.push({
    id: `m_${now}_idle`,
    from: "bot",
    body: "This chat was closed after 1 hour with no reply from the user.",
    createdAt: now,
  });
  await ref.update({
    status: "closed",
    closeReason: "idle",
    messages,
    updatedAt: now,
  });
}

function normalizeMessages(raw: unknown): TicketMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const x = m as Record<string, unknown>;
      const from =
        x.from === "admin" ? "admin" : x.from === "bot" ? "bot" : "user";
      return {
        id: String(x.id ?? ""),
        from: from as TicketMessage["from"],
        body: String(x.body ?? "").slice(0, 2000),
        createdAt: Number(x.createdAt) || 0,
      };
    })
    .filter((m) => m.body.length > 0);
}
