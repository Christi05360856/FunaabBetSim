/**
 * Phase 0 — set Firebase custom claim admin:true
 *
 * Usage (local, with service account or GOOGLE_APPLICATION_CREDENTIALS):
 *   node scripts/setAdminClaim.mjs <firebaseAuthUid>
 *
 * Or set ADMIN_UIDS in Vercel as comma-separated uids (no claim needed).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/setAdminClaim.mjs <uid>");
  process.exit(1);
}

if (!getApps().length) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    initializeApp({ credential: cert(JSON.parse(json)) });
  } else {
    initializeApp();
  }
}

const auth = getAuth();
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
console.log("OK: admin claim set for", uid);
console.log("User must refresh ID token (sign out/in) before admin routes work via claim.");
