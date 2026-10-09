/**
 * Feature switches read from environment variables.
 *
 * DEPOSITS_ENABLED=false  → new deposits are refused (withdrawals keep working,
 *                           so players can always take their money out).
 * AGE_GATE_ENFORCED=false → temporarily skip the 18+ date-of-birth requirement
 *                           (use only as a short grace period while rolling out).
 */
export function depositsEnabled(): boolean {
  return process.env.DEPOSITS_ENABLED?.trim().toLowerCase() !== "false";
}

export function ageGateEnforced(): boolean {
  return process.env.AGE_GATE_ENFORCED?.trim().toLowerCase() !== "false";
}
