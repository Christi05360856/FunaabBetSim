import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";

/**
 * Play-money self-reset is removed in the financial MVP.
 * Balance changes are deposit, settlement, withdrawal, or admin adjustment only.
 */
export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "Wallet self-reset is no longer available. Deposit points or contact support for an admin adjustment.",
    },
    { status: 403 }
  );
}
