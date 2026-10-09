import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { ageGateEnforced } from "@/lib/config/features";
import { checkDob } from "@/lib/compliance/age";
import {
  isAgeVerified,
  loadCompliance,
  recentDeposits,
  type ComplianceDoc,
} from "@/lib/compliance/gate";
import {
  EXCLUSION_OPTIONS_DAYS,
  LIMIT_INCREASE_DELAY_MS,
  LIMIT_PERIODS,
  MAX_LIMIT_NGN,
  MIN_LIMIT_NGN,
  isExcluded,
  limitWindowStart,
  requestLimitChange,
  resolveLimit,
  startExclusion,
  type LimitPeriod,
} from "@/lib/compliance/safePlay";

/**
 * GET  — the player's safer-play state (never returns the date of birth)
 * POST — { action: "confirm_age", dob }
 *        { action: "set_limit", period, value }   (value null = remove)
 *        { action: "exclude", days }
 */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await loadCompliance(user.uid);
  const now = Date.now();
  const deposits = await recentDeposits(user.uid);

  const limits = LIMIT_PERIODS.map((period) => {
    const setting = doc.limits?.[period];
    const start = limitWindowStart(period, now);
    const used = deposits
      .filter((d) => d.createdAt >= start)
      .reduce((sum, d) => sum + d.amount, 0);
    const pending =
      setting?.pending && setting.pending.effectiveAt > now
        ? setting.pending
        : null;
    return {
      period,
      value: resolveLimit(setting, now),
      used,
      pending,
    };
  });

  return NextResponse.json({
    ageGateEnforced: ageGateEnforced(),
    ageVerified: isAgeVerified(doc),
    ageBlocked: Boolean(doc.underageAttemptAt),
    limits,
    exclusion: {
      active: isExcluded(doc, now),
      until: isExcluded(doc, now) ? Number(doc.exclusionUntil) : null,
    },
    options: {
      exclusionDays: EXCLUSION_OPTIONS_DAYS,
      limitIncreaseDelayHours: LIMIT_INCREASE_DELAY_MS / 3_600_000,
      minLimit: MIN_LIMIT_NGN,
      maxLimit: MAX_LIMIT_NGN,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await enforceRateLimit("support_ticket", `safety:${user.uid}`);
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const ref = adminDb.collection("compliance").doc(user.uid);
  const now = Date.now();

  if (action === "confirm_age") {
    const doc = await loadCompliance(user.uid);
    if (isAgeVerified(doc)) return NextResponse.json({ ok: true });
    if (doc.underageAttemptAt) {
      return NextResponse.json(
        { error: "We could not confirm your age. Please contact support." },
        { status: 403 }
      );
    }
    const result = checkDob(body.dob, now);
    if (!result.ok) {
      // Remember an under-age answer so the date cannot simply be retyped.
      if (result.error.includes("or older")) {
        await ref.set({ underageAttemptAt: now }, { merge: true });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    await ref.set(
      { dob: result.dob, ageVerifiedAt: now, updatedAt: now },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "set_limit") {
    const period = String(body.period ?? "") as LimitPeriod;
    if (!LIMIT_PERIODS.includes(period)) {
      return NextResponse.json({ error: "Choose daily, weekly or monthly." }, { status: 400 });
    }
    let requested: number | null = null;
    if (body.value !== null && body.value !== undefined && body.value !== "") {
      const n = Math.round(Number(body.value));
      if (!Number.isFinite(n) || n < MIN_LIMIT_NGN || n > MAX_LIMIT_NGN) {
        return NextResponse.json(
          { error: `Enter a limit between ₦${MIN_LIMIT_NGN} and ₦${MAX_LIMIT_NGN}.` },
          { status: 400 }
        );
      }
      requested = n;
    }
    const saved = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const doc = (snap.exists ? snap.data() : {}) as ComplianceDoc;
      const next = requestLimitChange(doc.limits?.[period], requested, now);
      tx.set(
        ref,
        { limits: { ...(doc.limits ?? {}), [period]: next }, updatedAt: now },
        { merge: true }
      );
      return next;
    });
    return NextResponse.json({
      ok: true,
      delayed: Boolean(saved.pending),
      message: saved.pending
        ? `This change takes effect in ${LIMIT_INCREASE_DELAY_MS / 3_600_000} hours.`
        : "Limit saved.",
    });
  }

  if (action === "exclude") {
    const days = Number(body.days);
    if (!(EXCLUSION_OPTIONS_DAYS as readonly number[]).includes(days)) {
      return NextResponse.json({ error: "Choose one of the listed break lengths." }, { status: 400 });
    }
    const until = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const doc = (snap.exists ? snap.data() : {}) as ComplianceDoc;
      const next = startExclusion(doc, days, now);
      tx.set(
        ref,
        {
          exclusionUntil: next.exclusionUntil,
          exclusionStartedAt: next.exclusionStartedAt,
          updatedAt: now,
        },
        { merge: true }
      );
      return Number(next.exclusionUntil);
    });
    return NextResponse.json({ ok: true, until });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
