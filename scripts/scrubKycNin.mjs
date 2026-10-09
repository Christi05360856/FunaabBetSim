/**
 * One-off clean-up: replace plain-text NINs in the `kyc` collection with the
 * last 4 digits plus a keyed fingerprint, then delete the raw number.
 *
 * Needs PII_HASH_KEY (the same value you set in Vercel).
 * Dry run by default (changes nothing). Add --apply to write.
 *
 *   PII_HASH_KEY=... node scripts/scrubKycNin.mjs
 *   PII_HASH_KEY=... node scripts/scrubKycNin.mjs --apply
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS.
 */
import { createHmac } from "node:crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const key = process.env.PII_HASH_KEY?.trim();
if (!key) {
  console.error("Set PII_HASH_KEY first (same value as in Vercel).");
  process.exit(1);
}

if (!getApps().length) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) initializeApp({ credential: cert(JSON.parse(json)) });
  else initializeApp();
}

const db = getFirestore();
const snap = await db.collection("kyc").get();
let found = 0;
let changed = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const nin = typeof data.nin === "string" ? data.nin.replace(/\s/g, "") : "";
  if (!/^\d{11}$/.test(nin)) continue;
  found += 1;
  const patch = {
    ninLast4: nin.slice(-4),
    ninHash: createHmac("sha256", key).update(`nin:${nin}`).digest("hex"),
    nin: FieldValue.delete(),
  };
  if (apply) {
    await doc.ref.update(patch);
    changed += 1;
  }
  console.log(`${apply ? "scrubbed" : "would scrub"}: ${doc.id}`);
}

console.log(`\nPlain-text NINs found: ${found}. ${apply ? `Scrubbed: ${changed}.` : "Dry run only. Re-run with --apply."}`);
