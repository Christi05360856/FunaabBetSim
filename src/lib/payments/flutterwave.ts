import "server-only";

/**
 * Flutterwave Standard (v3) helpers — server only.
 * Env: FLW_PUBLIC_KEY, FLW_SECRET_KEY, FLW_SECRET_HASH
 */

const FLW_BASE = "https://api.flutterwave.com/v3";

function secretKey(): string {
  const k = process.env.FLW_SECRET_KEY?.trim();
  if (!k) throw new Error("FLW_SECRET_KEY is not configured");
  return k;
}

export function flwPublicKey(): string {
  const k = process.env.FLW_PUBLIC_KEY?.trim();
  if (!k) throw new Error("FLW_PUBLIC_KEY is not configured");
  return k;
}

export function flwSecretHash(): string {
  return process.env.FLW_SECRET_HASH?.trim() ?? "";
}

export type FlwInitPayload = {
  tx_ref: string;
  amount: number;
  currency: "NGN";
  redirect_url: string;
  customer: { email: string; name?: string; phonenumber?: string };
  customizations?: { title?: string; description?: string; logo?: string };
  meta?: Record<string, string>;
};

export type FlwInitResult = {
  link: string;
  flwRef?: string;
};

export async function flutterwaveInitializePayment(
  payload: FlwInitPayload
): Promise<FlwInitResult> {
  const res = await fetch(`${FLW_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: { link?: string; flwRef?: string };
  };
  if (!res.ok || body.status !== "success" || !body.data?.link) {
    throw new Error(
      body.message ?? `Flutterwave init failed (${res.status})`
    );
  }
  return { link: body.data.link, flwRef: body.data.flwRef };
}

export type FlwVerifyData = {
  id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;
  currency: string;
  status: string;
  charged_amount?: number;
};

export async function flutterwaveVerifyTransaction(
  transactionId: string | number
): Promise<FlwVerifyData> {
  const res = await fetch(
    `${FLW_BASE}/transactions/${transactionId}/verify`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey()}` },
      cache: "no-store",
    }
  );
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: FlwVerifyData;
  };
  if (!res.ok || body.status !== "success" || !body.data) {
    throw new Error(
      body.message ?? `Flutterwave verify failed (${res.status})`
    );
  }
  return body.data;
}

/** Fallback when redirect has tx_ref but no transaction_id. */
export async function flutterwaveVerifyByReference(
  txRef: string
): Promise<FlwVerifyData> {
  const url = new URL(`${FLW_BASE}/transactions/verify_by_reference`);
  url.searchParams.set("tx_ref", txRef);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: FlwVerifyData;
  };
  if (!res.ok || body.status !== "success" || !body.data) {
    throw new Error(
      body.message ?? `Flutterwave verify_by_reference failed (${res.status})`
    );
  }
  return body.data;
}

export function isValidFlutterwaveWebhook(
  verifHashHeader: string | null
): boolean {
  const expected = flwSecretHash();
  if (!expected) return false;
  if (!verifHashHeader) return false;
  return verifHashHeader === expected;
}
