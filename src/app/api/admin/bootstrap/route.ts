import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminAuth } from "@/lib/firebase/admin";

const bodySchema = z.object({
  secret: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing secret" }, { status: 400 });
  }

  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret || parsed.data.secret !== expectedSecret) {
    return NextResponse.json({ error: "Incorrect secret" }, { status: 403 });
  }

  await adminAuth.setCustomUserClaims(decoded.uid, { admin: true });

  return NextResponse.json({ ok: true, message: "You are now an admin. Log out and back in for it to take effect." });
}
