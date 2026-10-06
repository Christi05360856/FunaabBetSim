import "server-only";
import {
  resolveCrashRound,
  validateCrashInput,
} from "@/lib/casino/crash";

/** Same math as Crash Lite — themed as campus bus. */
export function resolveCampusCrashRound(opts: {
  stake: number;
  cashoutAt: number;
}) {
  return resolveCrashRound(opts);
}

export function validateCampusCrashInput(raw: {
  stake?: unknown;
  cashoutAt?: unknown;
}) {
  return validateCrashInput(raw);
}
