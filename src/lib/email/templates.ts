/** Simple HTML receipts — no React Email dependency. */

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e4e4e7">
    <p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:.06em">FUNAAB BetSim</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#18181b">${title}</h1>
    ${body}
    <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">This is an automated message. Never share your password.</p>
  </div></body></html>`;
}

export function depositEmailHtml(opts: {
  points: number;
  amountNgn: number;
  promoPoints?: number;
  txRef?: string;
}): { subject: string; html: string; text: string } {
  const promo =
    opts.promoPoints && opts.promoPoints > 0
      ? `<p style="color:#059669">Bonus promo: <strong>${opts.promoPoints.toLocaleString("en-NG")}</strong> points</p>`
      : "";
  const subject = `Deposit confirmed — ₦${opts.amountNgn.toLocaleString("en-NG")}`;
  const html = wrap(
    "Deposit successful",
    `<p>Your wallet was credited.</p>
     <p><strong>₦${opts.amountNgn.toLocaleString("en-NG")}</strong> → <strong>${opts.points.toLocaleString("en-NG")}</strong> cash points</p>
     ${promo}
     ${opts.txRef ? `<p style="font-size:12px;color:#71717a">Ref: ${opts.txRef}</p>` : ""}`
  );
  const text = `Deposit successful. ₦${opts.amountNgn} credited as ${opts.points} points.${opts.promoPoints ? ` Promo +${opts.promoPoints}.` : ""}`;
  return { subject, html, text };
}

export function withdrawalEmailHtml(opts: {
  status: "completed" | "rejected";
  amount: number;
  note?: string | null;
}): { subject: string; html: string; text: string } {
  if (opts.status === "completed") {
    const subject = `Withdrawal paid — ₦${opts.amount.toLocaleString("en-NG")}`;
    const html = wrap(
      "Withdrawal completed",
      `<p>Your withdrawal of <strong>₦${opts.amount.toLocaleString("en-NG")}</strong> has been marked paid.</p>
       <p style="font-size:14px;color:#52525b">Funds should arrive in your bank account according to your bank's timeline.</p>`
    );
    return {
      subject,
      html,
      text: `Withdrawal of ₦${opts.amount} completed.`,
    };
  }
  const subject = `Withdrawal update — ₦${opts.amount.toLocaleString("en-NG")}`;
  const html = wrap(
    "Withdrawal not approved",
    `<p>Your withdrawal request of <strong>₦${opts.amount.toLocaleString("en-NG")}</strong> was not approved.</p>
     ${opts.note ? `<p>Note: ${opts.note}</p>` : ""}
     <p>The reserved amount has been returned to your wallet balance where applicable.</p>`
  );
  return {
    subject,
    html,
    text: `Withdrawal of ₦${opts.amount} was rejected.${opts.note ? ` ${opts.note}` : ""}`,
  };
}
