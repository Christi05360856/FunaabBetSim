import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { computeCredit } from "@/lib/domain/limits";
import {
  resolveClinchedOverUnderWinners,
  resolveClinchedBTS,
} from "@/lib/domain/settlement";
import {
  applyStakeLoss,
  applyStakeVoid,
  applyStakeWin,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import type {
  Bet,
  BetLeg,
  BetLegStatus,
  Match,
  MatchStatus,
  Market,
  Wallet,
} from "@/types/domain";

const bodySchema = z.object({
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  status: z.enum(["live", "halftime", "second_half"]).optional(),
});

const IN_PLAY: MatchStatus[] = ["live", "halftime", "second_half"];
const CAN_GO_LIVE: MatchStatus[] = ["open", "locked"];

function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel || "",
      odds: bet.oddsAtPlacement || 1,
      status: bet.status === "won" ? "won" : bet.status === "lost" ? "lost" : "pending",
    },
  ];
}

/**
 * Clinch outcome for one leg on THIS match from the interim score.
 * Returns null if this leg is not on this match or not yet decided.
 */
function clinchLegOnMatch(
  leg: BetLeg,
  matchId: string,
  market: Market | undefined,
  clinchedByMarket: Map<string, string[]>
): BetLegStatus | null {
  if (leg.matchId !== matchId) return null;
  if (!market) return null;

  const winningIds = clinchedByMarket.get(leg.marketId);
  if (!winningIds || winningIds.length === 0) return null;

  if (market.type === "over_under") {
    // over_X in winners → that selection won; paired under_X is lost
    if (winningIds.includes(leg.selectionId)) return "won";
    const under = /^under_(\d+(?:\.\d+)?)$/.exec(leg.selectionId);
    if (under && winningIds.includes(`over_${under[1]}`)) return "lost";
    return null;
  }

  if (market.type === "both_teams_to_score") {
    // only "yes" can clinch; "no" is lost when yes clinches
    if (leg.selectionId === "yes" && winningIds.includes("yes")) return "won";
    if (leg.selectionId === "no" && winningIds.includes("yes")) return "lost";
    return null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const { matchId, homeScore, awayScore, status: nextStatus } = parsed.data;
  const matchRef = adminDb.collection("matches").doc(matchId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists) throw new Error("Match not found");
      const match = snap.data() as Match;
      const current = match.status;

      const alreadyInPlay = IN_PLAY.includes(current);
      const startingNow =
        CAN_GO_LIVE.includes(current) &&
        (nextStatus === "live" || nextStatus === undefined);
      if (!alreadyInPlay && !startingNow) {
        throw new Error(`Cannot update live score — match is "${current}"`);
      }
      if (nextStatus && !IN_PLAY.includes(nextStatus)) {
        throw new Error("Invalid live status");
      }

      const totalGoals = homeScore + awayScore;
      const btsClinched = resolveClinchedBTS(homeScore, awayScore);

      const marketsSnap = await tx.get(
        adminDb
          .collection("markets")
          .where("matchId", "==", matchId)
          .where("status", "==", "active")
      );

      const marketsById = new Map<string, Market>();
      const clinchedByMarket = new Map<string, string[]>();

      for (const marketDoc of marketsSnap.docs) {
        const market = { ...(marketDoc.data() as Market), id: marketDoc.id };
        marketsById.set(marketDoc.id, market);
        if (market.type === "over_under") {
          const winners = resolveClinchedOverUnderWinners(
            totalGoals,
            market.selections.map((s) => s.id)
          );
          if (winners.length > 0) clinchedByMarket.set(marketDoc.id, winners);
        } else if (market.type === "both_teams_to_score" && btsClinched === "yes") {
          clinchedByMarket.set(marketDoc.id, ["yes"]);
        }
      }

      // Open tickets that include this match (single or acca)
      const openByMatchId = await tx.get(
        adminDb
          .collection("bets")
          .where("matchId", "==", matchId)
          .where("status", "==", "open")
      );
      const openByMatchIds = await tx.get(
        adminDb
          .collection("bets")
          .where("matchIds", "array-contains", matchId)
          .where("status", "==", "open")
      );

      const betMap = new Map<string, Bet>();
      for (const d of openByMatchId.docs) {
        betMap.set(d.id, { ...(d.data() as Bet), id: d.id });
      }
      for (const d of openByMatchIds.docs) {
        betMap.set(d.id, { ...(d.data() as Bet), id: d.id });
      }

      const uids = Array.from(new Set(Array.from(betMap.values()).map((b) => b.uid)));
      const walletRefs = new Map(
        uids.map((uid) => [uid, adminDb.collection("wallets").doc(uid)] as const)
      );
      const walletSnaps = await Promise.all(
        Array.from(walletRefs.values()).map((ref) => tx.get(ref))
      );
      const walletsByUid = new Map<string, Wallet | undefined>();
      uids.forEach((uid, i) => {
        const data = walletSnaps[i]?.data() as Wallet | undefined;
        walletsByUid.set(uid, data ? normalizeWallet(data) : undefined);
      });

      // ---- Writes ----
      const now = Date.now();
      const update: {
        currentHomeScore: number;
        currentAwayScore: number;
        updatedAt: number;
        status?: MatchStatus;
      } = {
        currentHomeScore: homeScore,
        currentAwayScore: awayScore,
        updatedAt: now,
      };
      if (startingNow && !alreadyInPlay) {
        update.status = nextStatus ?? "live";
      } else if (nextStatus && nextStatus !== current) {
        update.status = nextStatus;
      }
      tx.update(matchRef, update);

      let betsClinched = 0;
      let legsUpdated = 0;

      for (const bet of betMap.values()) {
        const legs = betLegs(bet);
        let touchedThisMatch = false;
        const nextStatuses: BetLegStatus[] = legs.map((leg) => {
          const clinched = clinchLegOnMatch(
            leg,
            matchId,
            marketsById.get(leg.marketId),
            clinchedByMarket
          );
          if (clinched) {
            touchedThisMatch = true;
            return clinched;
          }
          // keep prior leg status if any, else pending
          if (leg.status === "won" || leg.status === "lost" || leg.status === "void") {
            return leg.status;
          }
          return "pending";
        });

        if (!touchedThisMatch) continue;

        const updatedLegs: BetLeg[] = legs.map((leg, i) => ({
          ...leg,
          status: nextStatuses[i],
        }));

        const anyLost = nextStatuses.some((s) => s === "lost");
        const anyPending = nextStatuses.some((s) => s === "pending");
        const allWon =
          nextStatuses.length > 0 && nextStatuses.every((s) => s === "won");
        const allVoid =
          nextStatuses.length > 0 && nextStatuses.every((s) => s === "void");
        const anyWon = nextStatuses.some((s) => s === "won");
        const anyVoid = nextStatuses.some((s) => s === "void");
        const winWithVoids =
          !anyLost &&
          !anyPending &&
          anyWon &&
          anyVoid &&
          nextStatuses.every((s) => s === "won" || s === "void");

        const betRef = adminDb.collection("bets").doc(bet.id);
        const wallet = walletsByUid.get(bet.uid);
        const split = {
          fromPurchased: bet.stakePurchased ?? bet.stake,
          fromPromo: bet.stakePromo ?? 0,
        };

        // ---- ACCA / single: LOST as soon as any leg is lost ----
        if (anyLost && bet.status === "open") {
          if (wallet) {
            const before = normalizeWallet(wallet);
            const next = applyStakeLoss(before, bet.stake, split);
            tx.update(walletRefs.get(bet.uid)!, {
              purchased: next.purchased,
              promo: next.promo,
              reservedStake: next.reservedStake,
              reservedPromoStake: next.reservedPromoStake,
              reservedWithdrawal: next.reservedWithdrawal,
              balance: next.balance,
              resetPendingSince: null,
              updatedAt: now,
            });
            walletsByUid.set(bet.uid, next);
            const ledgerRef = adminDb.collection("ledger").doc();
            tx.set(
              ledgerRef,
              buildLedgerEntry({
                id: ledgerRef.id,
                uid: bet.uid,
                type: "BET_LOSS_SETTLEMENT",
                amount: -bet.stake,
                balanceBefore: before.balance,
                balanceAfter: next.balance,
                betId: bet.id,
                metadata: { ...split, clinched: true },
                now,
              })
            );
          }
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
            status: "lost",
            settledAt: now,
          });
          betsClinched++;
          continue;
        }

        // ---- All legs decided WON (or won+void) → pay once ----
        if ((allWon || winWithVoids) && bet.status === "open") {
          let payout = bet.potentialPayout;
          if (winWithVoids && !allWon) {
            const mult = legs.reduce((acc, leg, i) => {
              if (nextStatuses[i] === "void") return acc;
              return acc * (Number(leg.odds) || 1);
            }, 1);
            payout = computeCredit(bet.stake, mult, bet.snr ? (bet.stakePromo ?? 0) : 0);
          }
          if (wallet) {
            const before = normalizeWallet(wallet);
            const next = applyStakeWin(before, bet.stake, payout, split);
            tx.update(walletRefs.get(bet.uid)!, {
              purchased: next.purchased,
              promo: next.promo,
              reservedStake: next.reservedStake,
              reservedPromoStake: next.reservedPromoStake,
              reservedWithdrawal: next.reservedWithdrawal,
              balance: next.balance,
              resetPendingSince: null,
              updatedAt: now,
            });
            walletsByUid.set(bet.uid, next);
            const ledgerRef = adminDb.collection("ledger").doc();
            tx.set(
              ledgerRef,
              buildLedgerEntry({
                id: ledgerRef.id,
                uid: bet.uid,
                type: "BET_WIN_SETTLEMENT",
                amount: payout,
                balanceBefore: before.balance,
                balanceAfter: next.balance,
                betId: bet.id,
                metadata: { ...split, clinched: true },
                now,
              })
            );
          }
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
            status: "won",
            settledAt: now,
            payout,
          });
          betsClinched++;
          continue;
        }

        if (allVoid && bet.status === "open") {
          if (wallet) {
            const before = normalizeWallet(wallet);
            const next = applyStakeVoid(before, bet.stake, bet.stakePromo ?? 0);
            tx.update(walletRefs.get(bet.uid)!, {
              purchased: next.purchased,
              promo: next.promo,
              reservedStake: next.reservedStake,
              reservedPromoStake: next.reservedPromoStake,
              reservedWithdrawal: next.reservedWithdrawal,
              balance: next.balance,
              resetPendingSince: null,
              updatedAt: now,
            });
            walletsByUid.set(bet.uid, next);
            const ledgerRef = adminDb.collection("ledger").doc();
            tx.set(
              ledgerRef,
              buildLedgerEntry({
                id: ledgerRef.id,
                uid: bet.uid,
                type: "BET_VOID_REFUND",
                amount: bet.stake,
                balanceBefore: before.balance,
                balanceAfter: next.balance,
                betId: bet.id,
                metadata: { clinched: true },
                now,
              })
            );
          }
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
            status: "void",
            settledAt: now,
          });
          betsClinched++;
          continue;
        }

        // ---- Still open: only persist leg statuses (NO payout) ----
        // Critical for ACCA: one clinched Over 3.5 must not pay the whole ticket.
        tx.update(betRef, {
          legs: updatedLegs,
          matchIds: legs.map((l) => l.matchId),
        });
        legsUpdated++;
      }

      return { ok: true, betsClinched, legsUpdated };
    });

    revalidateTag("fixtures-core");
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not update live score";
    return NextResponse.json({ error: message }, { status: 400 });
  }
            }

        
