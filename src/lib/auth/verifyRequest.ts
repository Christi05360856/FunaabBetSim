import "server-only";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";

/**
 * Verifies the Firebase ID token sent as `Authorization: Bearer <token>`.
 * Returns null if missing/invalid — callers must treat that as unauthenticated.
 * The client is never trusted to assert its own identity.
 */
export async function verifyRequest(request: NextRequest): Promise<DecodedIdToken | null> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}
