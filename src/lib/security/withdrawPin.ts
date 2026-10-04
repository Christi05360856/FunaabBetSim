import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const WEAK = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
  "0123",
  "3210",
  "1212",
  "2121",
  "1004",
  "2580",
]);

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isWeakPin(pin: string): boolean {
  if (!isValidPinFormat(pin)) return true;
  if (WEAK.has(pin)) return true;
  // sequential ascending/descending
  let asc = true;
  let desc = true;
  for (let i = 1; i < 4; i++) {
    if (Number(pin[i]) !== Number(pin[i - 1]) + 1) asc = false;
    if (Number(pin[i]) !== Number(pin[i - 1]) - 1) desc = false;
  }
  return asc || desc;
}

export function hashPin(pin: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex
    ? Buffer.from(saltHex, "hex")
    : randomBytes(16);
  const hash = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return { hash: hash.toString("hex"), salt: salt.toString("hex") };
}

export function verifyPin(
  pin: string,
  saltHex: string,
  hashHex: string
): boolean {
  try {
    const { hash } = hashPin(pin, saltHex);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(hashHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Opaque fingerprint for logs — not reversible to PIN */
export function pinFingerprint(pin: string): string {
  return createHash("sha256").update(pin).digest("hex").slice(0, 8);
}
