import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { sendMail } from "@/lib/email/send";
import { requireAdminTotpOnce } from "@/lib/security/adminTotpGuard";

/**
 * POST { to?: string, totpCode? }
 * Sends a short test mail via Resend. Default to = admin's own email.
 *
 * Resend free "onboarding@resend.dev" only delivers to the email on your
 * Resend account — not arbitrary user addresses until a domain is verified.
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const totpErr = await requireAdminTotpOnce((body as { totpCode?: string }).totpCode);
  if (totpErr) {
    return NextResponse.json({ error: totpErr }, { status: 401 });
  }

  const to = String(
    (body as { to?: string }).to ?? admin.email ?? ""
  )
    .trim()
    .toLowerCase();

  if (!to.includes("@")) {
    return NextResponse.json(
      { error: "No recipient email (pass body.to or use account with email)" },
      { status: 400 }
    );
  }

  const result = await sendMail({
    to,
    subject: "FUNAAB BetSim — email test",
    html: `<p>Resend is working for <strong>${to}</strong>.</p>
           <p style="color:#71717a;font-size:13px">If you only use onboarding@resend.dev, mail may only arrive at the Resend account owner address until you verify a custom domain.</p>`,
    text: `FUNAAB BetSim email test to ${to}`,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "send_failed",
        hint:
          result.error?.includes("domain") || result.error?.includes("from")
            ? "Check EMAIL_FROM matches a verified Resend sender"
            : "Check RESEND_API_KEY and Resend dashboard logs",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    to,
    from: process.env.EMAIL_FROM || "FUNAAB BetSim <onboarding@resend.dev>",
  });
}
