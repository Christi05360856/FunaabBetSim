import "server-only";
import type { NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import type { DecodedIdToken } from "firebase-admin/auth";

/**
 * Like verifyRequest, but additionally requires the `admin` custom claim.
 * Returns null for anyone not logged in AND for anyone logged in but not
 * an admin — callers treat both cases identically (403/401, no distinction
 * leaked to the caller about *why* they were rejected).
 */
export async function verifyAdminRequest(request: NextRequest): Promise<DecodedIdToken | null> {
  const decoded = await verifyRequest(request);
  if (!decoded) return null;
  if (decoded.admin !== true) return null;
  return decoded;
}
