import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers + enforced CSP.
 * Tuned for Firebase Auth/Firestore, Flutterwave checkout, Google Fonts, and same-origin SW.
 */
const CSP = [
  "default-src 'self'",
  // unsafe-eval removed (M-05). Keep unsafe-inline for Next until nonce-based CSP.
  "script-src 'self' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://www.gstatic.com https://checkout.flutterwave.com https://*.flutterwave.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.googleapis.com https://firestore.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net wss://*.firebaseio.com wss://*.googleapis.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.flutterwave.com https://*.flutterwave.com",
  "frame-src 'self' https://checkout.flutterwave.com https://*.flutterwave.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.flutterwave.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  // Enforced (blocks violations). Was Report-Only in P2.
  response.headers.set("Content-Security-Policy", CSP);
  // Drop any leftover Report-Only so browsers only see one policy.
  response.headers.delete("Content-Security-Policy-Report-Only");

  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
