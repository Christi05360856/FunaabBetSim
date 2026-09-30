import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import type { Competition, Match, Wallet } from "@/types/domain";
import { STARTING_BALANCE } from "@/types/domain";

export type ResetScope =
  | "external"
  | "funaab"
  | "manual"
  | "bets_tx"
  | "bets_wallets"
  | "financial_cutover"
  | "all"
  | "platform";

const BATCH_SIZE = 400;

async function deleteRefs(refs: import("firebase-admin/firestore").DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteByIds(collection: string, ids: string[]) {
  const refs = ids.map((id) => adminDb.collection(collection).doc(id));
  await deleteRefs(refs);
}

// Fixtures / odds / teams changed -> make the public pages refetch right away.
function refreshPublicCache() {
  revalidateTag("fixtures-core");
  revalidateTag("fixtures-static");
  revalidateTag("markets");
}

function isFunaabComp(c: Competition): boolean {
  const id = (c.id || "").toLowerCase();
  const name = (c.name || "").toLowerCase();
  return id.includes("funaab") || name.includes("funaab");
}

function isExternalMatch(m: Match): boolean {
  return (
    m.source === "external" ||
    m.provider === "football-data" ||
    (typeof m.id === "string" && m.id.startsWith("fd-"))
  );
}

function isManualMatch(m: Match): boolean {
  return m.source === "manual" || m.source === "bulk_import";
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Phase 0: destructive scopes blocked in production unless explicitly allowed
  const bodyEarly = await request.clone().json().catch(() => ({}));
  const scopeEarly = String((bodyEarly as { scope?: string }).scope ?? "");
  const destructive = ["all", "platform", "financial_cutover", "bets_wallets"].includes(
    scopeEarly
  );
  if (
    destructive &&
    process.env.VERCEL_ENV === "production" &&
    process.env.ALLOW_PROD_RESET !== "true"
  ) {
    return NextResponse.json(
      {
        error:
          "Destructive reset blocked in production. Set ALLOW_PROD_RESET=true only when intentional.",
      },
      { status: 403 }
    );
  }


  const body = await request.json().catch(() => ({}));
  const scope = body.scope as ResetScope | undefined;
  const allowed: ResetScope[] = [
    "external",
    "funaab",
    "manual",
    "bets_tx",
    "bets_wallets",
    "financial_cutover",
    "all",
    "platform",
  ];
  if (!scope || !allowed.includes(scope)) {
    return NextResponse.json(
      {
        error:
          "Invalid scope. Use: external | funaab | manual | bets_tx | bets_wallets | financial_cutover | all | platform",
      },
      { status: 400 }
    );
  }

  const counts: Record<string, number> = {};

  async function wipeCollection(name: string) {
    const snap = await adminDb.collection(name).get();
    await deleteRefs(snap.docs.map((d) => d.ref));
    counts[name] = (counts[name] ?? 0) + snap.size;
  }

  // Sets every wallet back to the starting balance (users are NOT deleted).
  async function resetAllWallets() {
    const wallets = await adminDb.collection("wallets").get();
    const now = Date.now();
    for (let i = 0; i < wallets.docs.length; i += BATCH_SIZE) {
      const chunk = wallets.docs.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      chunk.forEach((d) => {
        const w = d.data() as Wallet;
        batch.set(
          d.ref,
          {
            ...w,
            balance: STARTING_BALANCE,
            lifetimeWagering: 0,
            resetPendingSince: null,
            updatedAt: now,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
    counts.wallets_reset = wallets.size;
  }

  /** Phase F: hard zero multi-bucket wallets (no play starting balance). */
  async function zeroAllWalletsFinancial() {
    const wallets = await adminDb.collection("wallets").get();
    const now = Date.now();
    for (let i = 0; i < wallets.docs.length; i += BATCH_SIZE) {
      const chunk = wallets.docs.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      chunk.forEach((d) => {
        batch.set(
          d.ref,
          {
            uid: d.id,
            balance: 0,
            purchased: 0,
            promo: 0,
            reservedStake: 0,
            reservedWithdrawal: 0,
            lifetimeWagering: 0,
            resetPendingSince: null,
            updatedAt: now,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
    counts.wallets_zeroed = wallets.size;
  }

  async function resetWelcomePromo() {
    const ref = adminDb.collection("promotions").doc("WELCOME100");
    const now = Date.now();
    await ref.set(
      {
        id: "WELCOME100",
        code: "WELCOME100",
        ruleType: "welcome_fixed",
        bonusPoints: 100,
        minDepositNgn: 200,
        maxRedemptions: 100,
        redemptionCount: 0,
        active: true,
        exhaustedAt: null,
        updatedAt: now,
      },
      { merge: true }
    );
    counts.promo_welcome_reset = 1;
  }


  try {

    // ---- Phase F financial cutover (fixtures kept) ----
    if (scope === "financial_cutover") {
      await wipeCollection("bets");
      await wipeCollection("transactions");
      await wipeCollection("ledger");
      await wipeCollection("deposits");
      await wipeCollection("withdrawals");
      await wipeCollection("promo_redemptions");
      await wipeCollection("booking_codes");
      await zeroAllWalletsFinancial();
      await resetWelcomePromo();
      return NextResponse.json({
        ok: true,
        scope,
        message:
          "Phase F complete: wallets zeroed, bets/transactions/ledger/deposits/withdrawals/promo redemptions wiped. Fixtures kept. WELCOME100 reset.",
        counts,
      });
    }

    // ---- bets + transactions only (fixtures untouched, wallets untouched) ----
    if (scope === "bets_tx") {
      await wipeCollection("bets");
      await wipeCollection("transactions");
      return NextResponse.json({
        ok: true,
        scope,
        message: "Bets and transactions cleared",
        counts,
      });
    }

    // ---- bets + transactions + wallets reset (fixtures and odds kept) ----
    if (scope === "bets_wallets") {
      await wipeCollection("bets");
      await wipeCollection("transactions");
      await resetAllWallets();
      return NextResponse.json({
        ok: true,
        scope,
        message:
          "Bets and transactions cleared, wallets reset to ₦100,000. Fixtures and odds kept",
        counts,
      });
    }

    // ---- full wipes ----
    if (scope === "all" || scope === "platform") {
      for (const col of [
        "matches",
        "teams",
        "competitions",
        "markets",
        "bets",
        "transactions",
      ]) {
        await wipeCollection(col);
      }
      if (scope === "platform") {
        await resetAllWallets();
      }

      refreshPublicCache();

      return NextResponse.json({
        ok: true,
        scope,
        message:
          scope === "platform"
            ? "Platform reset complete (data wiped, wallets reset to ₦100,000)"
            : "All fixtures, teams, competitions, markets, bets and transactions cleared",
        counts,
      });
    }

    // ---- scoped fixture deletes ----
    const matchesSnap = await adminDb.collection("matches").get();
    const compsSnap = await adminDb.collection("competitions").get();
    const marketsSnap = await adminDb.collection("markets").get();
    const teamsSnap = await adminDb.collection("teams").get();

    const comps = compsSnap.docs.map((d) => ({
      ...(d.data() as Competition),
      id: d.id,
    }));
    const matches = matchesSnap.docs.map((d) => ({
      ...(d.data() as Match),
      id: d.id,
    }));

    const funaabCompIds = new Set(
      comps.filter(isFunaabComp).map((c) => c.id)
    );
    const externalCompIds = new Set(
      comps
        .filter(
          (c) =>
            c.provider === "football-data" ||
            Boolean(c.providerCode) ||
            ["epl", "laliga", "bundesliga", "ligue1", "seriea", "eredivisie", "brasileirao", "mls"].includes(
              (c.id || "").toLowerCase()
            )
        )
        .map((c) => c.id)
    );

    let matchIds: string[] = [];
    let compIds: string[] = [];
    let teamIds: string[] = [];

    if (scope === "external") {
      matchIds = matches.filter(isExternalMatch).map((m) => m.id);
      // also matches under external competition ids
      const byComp = matches
        .filter((m) => externalCompIds.has(m.competitionId))
        .map((m) => m.id);
      matchIds = Array.from(new Set([...matchIds, ...byComp]));
      compIds = Array.from(externalCompIds);
      teamIds = teamsSnap.docs
        .filter((d) => d.id.startsWith("fd-"))
        .map((d) => d.id);
    } else if (scope === "funaab") {
      matchIds = matches
        .filter((m) => funaabCompIds.has(m.competitionId))
        .map((m) => m.id);
      compIds = Array.from(funaabCompIds);
      // teams that only appear in funaab matches (optional cleanup)
      const funaabTeamUse = new Set<string>();
      matches
        .filter((m) => funaabCompIds.has(m.competitionId))
        .forEach((m) => {
          if (m.homeTeamId) funaabTeamUse.add(m.homeTeamId);
          if (m.awayTeamId) funaabTeamUse.add(m.awayTeamId);
        });
      const otherTeamUse = new Set<string>();
      matches
        .filter((m) => !funaabCompIds.has(m.competitionId))
        .forEach((m) => {
          if (m.homeTeamId) otherTeamUse.add(m.homeTeamId);
          if (m.awayTeamId) otherTeamUse.add(m.awayTeamId);
        });
      teamIds = Array.from(funaabTeamUse).filter((id) => !otherTeamUse.has(id));
    } else if (scope === "manual") {
      // Manual / bulk_import matches that are NOT under FUNAAB comps and NOT external
      matchIds = matches
        .filter(
          (m) =>
            isManualMatch(m) &&
            !isExternalMatch(m) &&
            !funaabCompIds.has(m.competitionId)
        )
        .map((m) => m.id);
      // Do not delete competitions for manual — only orphan matches
      compIds = [];
      teamIds = [];
    }

    const matchIdSet = new Set(matchIds);
    const marketIds = marketsSnap.docs
      .filter((d) => {
        const mid = (d.data() as { matchId?: string }).matchId;
        return mid && matchIdSet.has(mid);
      })
      .map((d) => d.id);

    await deleteByIds("markets", marketIds);
    counts.markets = marketIds.length;

    await deleteByIds("matches", matchIds);
    counts.matches = matchIds.length;

    if (compIds.length) {
      await deleteByIds("competitions", compIds);
      counts.competitions = compIds.length;
    }
    if (teamIds.length) {
      await deleteByIds("teams", teamIds);
      counts.teams = teamIds.length;
    }

    refreshPublicCache();

    return NextResponse.json({
      ok: true,
      scope,
      message: "Scoped reset complete",
      counts,
    });
  } catch (err) {
    console.error("reset failed", scope, err);
    const message = err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  }

          
