import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/security/safeCompare";
import { clientIp } from "@/lib/security/clientIp";
import { startOfLagosDayMs } from "@/lib/time/lagosDay";
import { matchTotpStep } from "@/lib/security/adminTotp";
import { evaluateFlutterwavePayment } from "@/lib/payments/verifyDeposit";
import type { FlwVerifyData } from "@/lib/payments/flutterwave";
import { publicErrorMessage } from "@/lib/security/publicError";

function fakeRequest(headers: Record<string, string>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    } as unknown as Headers,
  };
}

describe("safeEqual", () => {
  it("matches equal strings and rejects different ones, any length", () => {
    expect(safeEqual("secret-123", "secret-123")).toBe(true);
    expect(safeEqual("secret-123", "secret-124")).toBe(false);
    expect(safeEqual("short", "a-much-longer-value")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the platform header over a spoofable x-forwarded-for", () => {
    const ip = clientIp(
      fakeRequest({
        "x-vercel-forwarded-for": "41.0.0.9",
        "x-forwarded-for": "6.6.6.6, 41.0.0.9",
      })
    );
    expect(ip).toBe("41.0.0.9");
  });

  it("falls back to x-real-ip, then x-forwarded-for, then unknown", () => {
    expect(clientIp(fakeRequest({ "x-real-ip": "10.1.1.1" }))).toBe("10.1.1.1");
    expect(clientIp(fakeRequest({ "x-forwarded-for": "8.8.8.8, 1.1.1.1" }))).toBe("8.8.8.8");
    expect(clientIp(fakeRequest({}))).toBe("unknown");
  });
});

describe("startOfLagosDayMs", () => {
  it("rolls over at midnight Lagos time (23:00 UTC), not midnight UTC", () => {
    // 23:30 UTC on 9 Oct is already 00:30 on 10 Oct in Lagos
    const justAfterMidnight = Date.UTC(2026, 9, 9, 23, 30);
    expect(startOfLagosDayMs(justAfterMidnight)).toBe(Date.UTC(2026, 9, 9, 23, 0));
    // 10:00 UTC on 9 Oct is 11:00 in Lagos, same Lagos day started 23:00 UTC on 8 Oct
    const midday = Date.UTC(2026, 9, 9, 10, 0);
    expect(startOfLagosDayMs(midday)).toBe(Date.UTC(2026, 9, 8, 23, 0));
  });
});

describe("matchTotpStep", () => {
  it("accepts the RFC 6238 test vector and reports its time step", () => {
    const realNow = Date.now;
    Date.now = () => 59_000; // RFC 6238: T=59s, counter 1, code ...287082
    try {
      const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32("12345678901234567890")
      expect(matchTotpStep(secret, "287082")).toBe(1);
      expect(matchTotpStep(secret, "000000")).toBe(null);
      expect(matchTotpStep(secret, "28708")).toBe(null);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("evaluateFlutterwavePayment", () => {
  const base: FlwVerifyData = {
    id: 1,
    tx_ref: "FB-1",
    flw_ref: "F1",
    amount: 5000,
    currency: "NGN",
    status: "successful",
    charged_amount: 5075,
  };

  it("accepts a good payment and uses amount, not charged_amount", () => {
    const r = evaluateFlutterwavePayment(base, "FB-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountNgn).toBe(5000);
  });

  it("rejects wrong reference, currency, status and bad amounts", () => {
    expect(evaluateFlutterwavePayment(base, "FB-2").ok).toBe(false);
    expect(evaluateFlutterwavePayment({ ...base, currency: "USD" }, "FB-1").ok).toBe(false);
    expect(evaluateFlutterwavePayment({ ...base, status: "failed" }, "FB-1").ok).toBe(false);
    expect(evaluateFlutterwavePayment({ ...base, amount: 0 }, "FB-1").ok).toBe(false);
  });
});

describe("publicErrorMessage (production)", () => {
  it("passes our own short messages but hides database and provider internals", () => {
    const prevVercel = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      expect(publicErrorMessage(new Error("Insufficient balance"))).toBe("Insufficient balance");
      expect(publicErrorMessage(new Error("9 FAILED_PRECONDITION: The query requires an index"), "fallback")).toBe("fallback");
      expect(publicErrorMessage(new Error("Firestore transaction failed"), "fallback")).toBe("fallback");
      expect(publicErrorMessage(new Error("Invalid API key for secret"), "fallback")).toBe("fallback");
      expect(publicErrorMessage("not an error", "fallback")).toBe("fallback");
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevVercel;
    }
  });
});
