import "server-only";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendMail(
  input: SendMailInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() ||
    "FUNAAB BetSim <onboarding@resend.dev>";

  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skip send");
    return { ok: false, error: "email_not_configured" };
  }
  if (!input.to || !input.to.includes("@")) {
    return { ok: false, error: "invalid_to" };
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
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
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
