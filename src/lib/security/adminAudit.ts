import "server-only";
import { adminDb } from "@/lib/firebase/admin";

export type AdminAuditAction =
  | "withdrawal_approve"
  | "withdrawal_reject"
  | "kyc_verify"
  | "kyc_reject"
  | "platform_danger"
  | "other";

/**
 * Immutable admin action log. Never throws to callers — audit must not break money ops.
 */
export async function writeAdminAudit(input: {
  adminUid: string;
  adminEmail?: string | null;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ref = adminDb.collection("admin_audit").doc();
    await ref.set({
      id: ref.id,
      adminUid: input.adminUid,
      adminEmail: input.adminEmail ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta ?? {},
      createdAt: Date.now(),
    });
  } catch (e) {
    console.error("admin audit write failed", e);
  }
}
