import "server-only";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";

/**
 * Verifies the Firebase ID token sent as `Authorization: Bearer <token>`.
 * checkRevoked=true so disabled / revoked sessions fail closed on money routes.
 */
export async function verifyRequest(
  request: NextRequest
): Promise<DecodedIdToken | null> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  try {
    return await adminAuth.verifyIdToken(token, true);
  } catch {
    return null;
  }
}
