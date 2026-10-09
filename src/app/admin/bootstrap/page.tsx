import { notFound } from "next/navigation";

// Admin bootstrap is disabled. Use scripts/setAdminClaim.mjs instead.
export default function BootstrapAdminPage() {
  return notFound();
}
