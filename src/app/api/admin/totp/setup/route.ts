import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import {
  generateTotpSecret,
  otpauthUrl,
  totpConfigured,
  verifyTotp,
} from "@/lib/security/adminTotp";

/**
 * GET  — if ADMIN_TOTP_SECRET already set, reports configured.
 *         if not, returns a one-time suggested secret + otpauth URL
 *         (you must paste secret into Vercel env; we do not write secrets to Firestore).
 * POST — body { code } test-verifies against ADMIN_TOTP_SECRET (after you set env).
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (totpConfigured()) {
    return NextResponse.json({
      configured: true,
      message: "ADMIN_TOTP_SECRET is set. Cash actions require a 6-digit code.",
    });
  }

  const secret = generateTotpSecret();
  return NextResponse.json({
    configured: false,
    message:
      "Copy secret into Vercel env ADMIN_TOTP_SECRET, redeploy, then add to Google Authenticator via the otpauth URL or secret.",
    secret,
    otpauthUrl: otpauthUrl(secret, admin.uid?.slice?.(0, 8) || "admin"),
  });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const secret = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Set ADMIN_TOTP_SECRET in Vercel first" },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const code = String((body as { code?: string }).code ?? "");
  const ok = verifyTotp(secret, code);
  return NextResponse.json({ ok });
}
