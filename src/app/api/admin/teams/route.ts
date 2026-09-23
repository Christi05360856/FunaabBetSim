// src/app/api/admin/teams/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  shortName: z.string().trim().min(2).max(10),
});

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const now = Date.now();
  const ref = adminDb.collection("teams").doc();
  await ref.set({
    id: ref.id,
    name: parsed.data.name,
    shortName: parsed.data.shortName,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id });
}
