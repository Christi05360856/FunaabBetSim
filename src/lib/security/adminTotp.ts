import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Admin TOTP (Google Authenticator compatible).
 * Env: ADMIN_TOTP_SECRET = base32 secret (set after setup).
 * If secret is missing, requireAdminTotp() allows the request (email-only rollout).
 * Once secret is set, cash actions need a valid 6-digit code.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(
  secretBase32: string,
  token: string,
  window = 1
): boolean {
  const cleaned = String(token).replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, counter + w);
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(cleaned);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

export function totpConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOTP_SECRET?.trim());
}

/** Returns null if OK, or an error message. */
export function requireAdminTotp(code: unknown): string | null {
  const secret = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!secret) return null; // not enforced until you set the env
  if (!verifyTotp(secret, String(code ?? ""))) {
    return "Invalid or missing admin authenticator code";
  }
  return null;
}

export function otpauthUrl(secret: string, account = "admin"): string {
  const issuer = encodeURIComponent("FUNAAB BetSim Admin");
  const label = encodeURIComponent(`FUNAAB:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
