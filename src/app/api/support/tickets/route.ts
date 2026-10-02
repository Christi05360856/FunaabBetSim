import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { enforceRateLimit } from "@/lib/security/rateLimit";

/** No user message for this long → ticket auto-closes (1 hour). */
const IDLE_MS = 60 * 60 * 1000;

export type TicketMessage = {
  id: string;
  from: "user" | "admin" | "bot";
  body: string;
  createdAt: number;
};

/**
 * GET  — own tickets (applies idle close)
 * POST — create { category, body } or reply { ticketId, body }
 *
 * Path: src/app/api/support/tickets/route.ts
 */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snap = await adminDb
    .collection("support_tickets")
    .where("uid", "==", user.uid)
    .limit(40)
    .get();

  const now = Date.now();
  const items = [];

  for (const d of snap.docs) {
    const closed = await maybeIdleClose(d.ref, d.data(), now);
    const x = closed ?? d.data();
    items.push({
      id: d.id,
      subject: x.subject as string,
      category: (x.category as string) || "other",
      status: x.status as string,
      createdAt: Number(x.createdAt) || 0,
      updatedAt: Number(x.updatedAt) || 0,
      lastUserMessageAt: Number(x.lastUserMessageAt) || 0,
      closeReason: (x.closeReason as string | null) ?? null,
      messages: normalizeMessages(x.messages),
    });
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ items: items.slice(0, 30) });
}

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ticketId?: string;
    category?: string;
    body?: string;
  };

  const messageText = String(body.body ?? "").trim().slice(0, 2000);
  if (messageText.length < 2) {
    return NextResponse.json(
      { error: "Message is too short" },
      { status: 400 }
    );
  }

  const now = Date.now();

  // ——— Reply ———
  if (body.ticketId) {
    const blocked = await enforceRateLimit(
      "support_ticket",
      `uid:${user.uid}:reply`
    );
    if (blocked) return blocked;

    const ref = adminDb.collection("support_tickets").doc(String(body.ticketId));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const closed = await maybeIdleClose(ref, snap.data()!, now);
    const data = closed ?? snap.data()!;

    if (String(data.uid) !== user.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (String(data.status) === "closed") {
      return NextResponse.json(
        {
          error:
            data.closeReason === "idle"
              ? "This chat closed after 1 hour of inactivity. Please start a new request."
              : "This ticket is closed. Start a new request from Support.",
        },
        { status: 400 }
      );
    }

    const messages = normalizeMessages(data.messages);
    if (messages.length >= 80) {
      return NextResponse.json(
        { error: "Thread limit reached. Please open a new request." },
        { status: 400 }
      );
    }

    const msg: TicketMessage = {
      id: msgId(now),
      from: "user",
      body: messageText,
      createdAt: now,
    };
    messages.push(msg);

    await ref.update({
      messages,
      lastUserMessageAt: now,
      updatedAt: now,
      status: data.status,
    });

    return NextResponse.json({ ok: true, id: ref.id, messageId: msg.id });
  }

  // ——— New agent ticket ———
  const blocked = await enforceRateLimit("support_ticket", `uid:${user.uid}`);
  if (blocked) return blocked;

  const category = sanitizeCategory(body.category);
  const subject = subjectFor(category);

  const userMsg: TicketMessage = {
    id: msgId(now),
    from: "user",
    body: messageText,
    createdAt: now,
  };
  const botMsg: TicketMessage = {
    id: msgId(now + 1),
    from: "bot",
    body: "Thanks — an agent will reply here when available. Typical hours: Mon–Sat 9:00–18:00 WAT. This chat closes after 1 hour if you stop responding.",
    createdAt: now + 1,
  };

  const ref = adminDb.collection("support_tickets").doc();
  await ref.set({
    id: ref.id,
    uid: user.uid,
    email: user.email ?? null,
    subject,
    category,
    status: "open",
    messages: [userMsg, botMsg],
    lastUserMessageAt: now,
    closeReason: null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id });
}

async function maybeIdleClose(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: { update: (data: Record<string, unknown>) => Promise<unknown> },
  data: Record<string, unknown>,
  now: number
): Promise<Record<string, unknown> | null> {
  if (String(data.status) === "closed") return null;
  const last =
    Number(data.lastUserMessageAt) ||
    Number(data.updatedAt) ||
    Number(data.createdAt) ||
    0;
  if (!last || now - last < IDLE_MS) return null;

  const messages = normalizeMessages(data.messages);
  messages.push({
    id: msgId(now),
    from: "bot",
    body: "This chat was closed after 1 hour with no reply from you. Open a new request from Support if you still need help.",
    createdAt: now,
  });

  const next = {
    ...data,
    status: "closed",
    closeReason: "idle",
    messages,
    updatedAt: now,
  };
  await ref.update({
    status: "closed",
    closeReason: "idle",
    messages,
    updatedAt: now,
  });
  return next;
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

function msgId(now: number) {
  return `m_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeCategory(raw: unknown): string {
  const c = String(raw ?? "other").toLowerCase();
  const ok = [
    "deposits",
    "withdrawals",
    "bets",
    "account",
    "promo",
    "booking",
    "other",
  ];
  return ok.includes(c) ? c : "other";
}

function subjectFor(category: string): string {
  const map: Record<string, string> = {
    deposits: "Deposit issue",
    withdrawals: "Withdrawal issue",
    bets: "Bet / result issue",
    account: "Account / wallet",
    promo: "Promo / bonus",
    booking: "Booking code",
    other: "Support request",
  };
  return map[category] ?? "Support request";
      }
