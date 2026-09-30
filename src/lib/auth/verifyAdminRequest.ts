import "server-only";
import type { NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import type { DecodedIdToken } from "firebase-admin/auth";

/**
 * Admin gate (Phase 0):
 * 1) Firebase custom claim `admin: true`, OR
 * 2) uid listed in env ADMIN_UIDS (comma-separated).
 * Never trust the client to assert admin.
 */
function adminUidAllowlist(): Set<string> {
  const raw = process.env.ADMIN_UIDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export async function verifyAdminRequest(
  request: NextRequest
): Promise<DecodedIdToken | null> {
  const decoded = await verifyRequest(request);
  if (!decoded) return null;

  if (decoded.admin === true) return decoded;

  const allow = adminUidAllowlist();
  if (allow.size > 0 && allow.has(decoded.uid)) return decoded;

  return null;
}
