import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Recent security / audit events (Phase 2).
 * Admin only. Newest first.
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") || 40))
  );

  try {
    const snap = await adminDb
      .collection("security_events")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const events = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    return NextResponse.json({ ok: true, events });
  } catch (err) {
    // Missing index fallback: unordered sample
    const snap = await adminDb.collection("security_events").limit(limit).get();
    const events = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .sort(
        (a, b) =>
          Number((b as { createdAt?: number }).createdAt || 0) -
          Number((a as { createdAt?: number }).createdAt || 0)
      );
    return NextResponse.json({
      ok: true,
      events,
      warning: "Sorted in memory — create composite index on createdAt desc if needed",
      errorDetail: err instanceof Error ? err.message : undefined,
    });
  }
}
