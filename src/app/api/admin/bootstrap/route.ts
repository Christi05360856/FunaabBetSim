import { NextResponse } from "next/server";

/**
 * Disabled on purpose. Self-service admin promotion over the internet is a
 * privilege-escalation risk. Create admins offline with:
 *   node scripts/setAdminClaim.mjs <uid>
 * and delete ADMIN_BOOTSTRAP_SECRET from your hosting environment.
 */
function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
  return notFound();
}

export async function POST() {
  return notFound();
}
