import "server-only";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Resend free tier (onboarding@resend.dev) only delivers to the Resend
 * account email. Set EMAIL_OVERRIDE_TO=that@email for testing so deposit /
 * withdrawal receipts actually arrive. Remove after you verify a domain.
 */
export async function sendMail(
  input: SendMailInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() ||
    "FUNAAB BetSim <onboarding@resend.dev>";

  const override = process.env.EMAIL_OVERRIDE_TO?.trim().toLowerCase();
  const intended = String(input.to || "")
    .trim()
    .toLowerCase();
  const to = override && override.includes("@") ? override : intended;

  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skip send");
    return { ok: false, error: "email_not_configured" };
  }
  if (!to || !to.includes("@")) {
    return { ok: false, error: "invalid_to" };
  }

  // Note in body when we redirected for testing
  let html = input.html;
  let text = input.text;
  if (override && intended && override !== intended) {
    const note = `<p style="font-size:12px;color:#a1a1aa">[test] Intended recipient: ${intended}</p>`;
    html = (html || "") + note;
    text = (text || "") + ` [test intended: ${intended}]`;
    console.info("[email] EMAIL_OVERRIDE_TO active", { intended, to });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: input.subject,
        html,
        text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      console.error("[email] Resend error", res.status, body);
      return { ok: false, error: body.message || `status_${res.status}` };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    console.error("[email] send failed", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "send_failed",
    };
  }
}

export async function resolveUserEmail(uid: string): Promise<string | null> {
  try {
    const { adminAuth } = await import("@/lib/firebase/admin");
    const user = await adminAuth.getUser(uid);
    return user.email ?? null;
  } catch {
    return null;
  }
}
