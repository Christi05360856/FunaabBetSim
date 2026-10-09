import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { matchTotpStep, requireAdminTotp } from "@/lib/security/adminTotp";

/**
 * Same checks as requireAdminTotp, plus replay protection: a code (time step)
 * can be accepted only once, and steps must keep increasing.
 * Returns null if OK, or an error message.
 */
export async function requireAdminTotpOnce(
  code: unknown
): Promise<string | null> {
  const basic = requireAdminTotp(code);
  if (basic) return basic;

  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.ADMIN_TOTP_SECRET?.trim();
  const bypass = !isProd && process.env.ADMIN_TOTP_BYPASS === "true";
  // Local-dev convenience paths (no secret / explicit bypass): nothing to track.
  if (bypass || !secret) return null;

  const step = matchTotpStep(secret, String(code ?? ""));
  if (step === null) return "Invalid or missing admin authenticator code";

  const ref = adminDb.collection("admin_totp_state").doc("current");
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const last = snap.exists
        ? Number((snap.data() as { lastStep?: number }).lastStep) || 0
        : 0;
      if (step <= last) {
        return "That code was already used. Wait for the next code and try again.";
      }
      tx.set(ref, { lastStep: step, usedAt: Date.now() }, { merge: true });
      return null;
    });
  } catch (err) {
    console.error("admin totp replay guard error", err);
    return "Could not verify the authenticator code. Try again.";
  }
}
