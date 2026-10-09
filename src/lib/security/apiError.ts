import { NextResponse } from "next/server";
import { isProd, publicErrorMessage } from "@/lib/security/publicError";

export { isProd, publicErrorMessage };

export function jsonError(
  err: unknown,
  status = 400,
  fallback?: string
): NextResponse {
  return NextResponse.json(
    { error: publicErrorMessage(err, fallback) },
    { status }
  );
}
