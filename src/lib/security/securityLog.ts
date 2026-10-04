import "server-only";
import { adminDb } from "@/lib/firebase/admin";

export type SecurityEventType =
  | "RATE_LIMIT"
  | "BET_PLACED"
  | "DEPOSIT_INIT"
  | "DEPOSIT_CREDITED"
  | "WITHDRAW_REQUESTED"
  | "CALLBACK_REJECTED"
  | "ADMIN_ACTION"
  | "AUTH_REGISTER"
  | "IDOR_ATTEMPT"
  | "BOOK_CODE"
  | "VERIFY_TICKET"
  | "PIN_SET"
  | "PIN_CHANGED"
  | "PIN_FAIL";

/**
 * Append-only security / audit log (Admin SDK only).
 * Never block the main request if logging fails.
 */
export async function securityLog(input: {
  type: SecurityEventType;
  uid?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ref = adminDb.collection("security_events").doc();
    await ref.set({
      id: ref.id,
      type: input.type,
      uid: input.uid ?? null,
      ip: input.ip ?? null,
      meta: input.meta ?? {},
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error("securityLog failed", input.type, err);
  }
}
