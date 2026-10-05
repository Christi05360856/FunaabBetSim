import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { maskUsername } from "@/lib/domain/maskUsername";

const MAX_LEN = 160;
const PAGE = 45;

type Msg = {
  id: string;
  uid: string;
  mask: string;
  text: string;
  createdAt: number;
};

function messagesCol(matchId: string) {
  return adminDb.collection("match_chat").doc(matchId).collection("messages");
}

/** GET — last messages (logged-in only). Poll from client; no realtime. */
export async function GET(
  request: NextRequest,
  context: { params: { matchId: string } }
) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to view chat" }, { status: 401 });
  }

  const matchId = String(context.params.matchId ?? "").trim();
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match" }, { status: 400 });
  }

  const matchSnap = await adminDb.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const snap = await messagesCol(matchId)
    .orderBy("createdAt", "desc")
    .limit(PAGE)
    .get();

  const messages: Msg[] = snap.docs
    .map((d) => d.data() as Msg)
    .reverse();

  return NextResponse.json({ ok: true, messages });
}

/** POST — post a message (logged-in, rate limited). */
export async function POST(
  request: NextRequest,
  context: { params: { matchId: string } }
) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to chat" }, { status: 401 });
  }

  const limited = await enforceRateLimit("match_chat", `uid:${user.uid}`);
  if (limited) return limited;

  const matchId = String(context.params.matchId ?? "").trim();
  if (!matchId) {
    return NextResponse.json({ error: "Invalid match" }, { status: 400 });
  }

  const matchSnap = await adminDb.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN);

  if (text.length < 1) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const nameHint =
    (user.name as string | undefined) ||
    (user.email ? String(user.email).split("@")[0] : "fan");
  const mask = maskUsername(nameHint);

  const ref = messagesCol(matchId).doc();
  const row: Msg = {
    id: ref.id,
    uid: user.uid,
    mask,
    text,
    createdAt: Date.now(),
  };
  await ref.set(row);


  return NextResponse.json({ ok: true, message: row });
}
