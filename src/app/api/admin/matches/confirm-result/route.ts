import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { adminDb } from "@/lib/firebase/admin";
import { confirmResultSchema } from "@/lib/validation/schemas";
import {
  resolveMatchWinnerSelectionId,
  resolveDoubleChanceSelectionIds,
  resolveDrawNoBetSelectionId,
  resolveOverUnderLadderWinners,
  resolveBTSSelectionId,
  resolveCorrectScoreOutcome,
} from "@/lib/domain/settlement";
import type {
  Bet,
  BetLeg,
  BetLegStatus,
  Market,
  Match,
  Transaction,
  Wallet,
} from "@/types/domain";

type LegResult = "won" | "lost" | "void" | "pending";

function resolveSelectionAgainstScore(
  market: Market,
  selectionId: string,
  homeScore: number,
  awayScore: number
): LegResult {
  switch (market.type) {
    case "match_winner": {
      const w = resolveMatchWinnerSelectionId(homeScore, awayScore);
      return selectionId === w ? "won" : "lost";
    }
    case "double_chance": {
      const winners = resolveDoubleChanceSelectionIds(homeScore, awayScore);
      return winners.includes(
        selectionId as "home_draw" | "home_away" | "draw_away"
      )
        ? "won"
        : "lost";
    }
    case "draw_no_bet": {
      const r = resolveDrawNoBetSelectionId(homeScore, awayScore);
      if (r === "refund") return "void";
      return selectionId === r ? "won" : "lost";
    }
    case "over_under": {
      const total = homeScore + awayScore;
      const winners = resolveOverUnderLadderWinners(
        total,
        market.selections.map((s) => s.id)
      );
      return winners.includes(selectionId) ? "won" : "lost";
    }
    case "both_teams_to_score": {
      const w = resolveBTSSelectionId(homeScore, awayScore);
      return selectionId === w ? "won" : "lost";
    }
    case "correct_score": {
      const { exactId, otherBucketId } = resolveCorrectScoreOutcome(
        homeScore,
        awayScore
      );
      const exactOffered = market.selections.some((s) => s.id === exactId);
      const winId = exactOffered ? exactId : otherBucketId;
      return selectionId === winId ? "won" : "lost";
    }
    default:
      return "pending";
  }
}

function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel,
      odds: bet.oddsAtPlacement,
    },
  ];
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAdminRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = confirmResultSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }
  const { matchId, homeScore, awayScore } = parsed.data;

  const matchRef = adminDb.collection("matches").doc(matchId);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new Error("Match not found");
      const match = matchSnap.data() as Match;

      if (match.status === "settled") {
        return { alreadySettled: true, betsSettled: 0 };
      }
      if (match.status === "postponed" || match.status === "voided") {
        throw new Error("Cannot settle — match is " + match.status);
      }

      const marketsSnap = await tx.get(
        adminDb.collection("markets").where("matchId", "==", matchId)
      );
      const marketsById = new Map(
        marketsSnap.docs.map((d) => [d.id, d.data() as Market])
      );

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

      // Refresh legs on already LOST/WON tickets (no second payout)
      const lostByMatchId = await tx.get(
        adminDb
          .collection("bets")
          .where("matchId", "==", matchId)
          .where("status", "==", "lost")
      );
      const lostByMatchIds = await tx.get(
        adminDb
          .collection("bets")
          .where("matchIds", "array-contains", matchId)
          .where("status", "==", "lost")
      );
      const wonByMatchId = await tx.get(
        adminDb
          .collection("bets")
          .where("matchId", "==", matchId)
          .where("status", "==", "won")
      );
      const wonByMatchIds = await tx.get(
        adminDb
          .collection("bets")
          .where("matchIds", "array-contains", matchId)
          .where("status", "==", "won")
      );
      for (const d of [
        ...lostByMatchId.docs,
        ...lostByMatchIds.docs,
        ...wonByMatchId.docs,
        ...wonByMatchIds.docs,
      ]) {
        if (!betMap.has(d.id)) {
          betMap.set(d.id, { ...(d.data() as Bet), id: d.id });
        }
      }

      const extraMatchIds = new Set<string>();
      const extraMarketIds = new Set<string>();
      for (const bet of betMap.values()) {
        for (const leg of betLegs(bet)) {
          if (leg.matchId !== matchId) extraMatchIds.add(leg.matchId);
          if (!marketsById.has(leg.marketId)) extraMarketIds.add(leg.marketId);
        }
      }

      const otherMatches = new Map<string, Match>();
      otherMatches.set(matchId, {
        ...match,
        homeScore,
        awayScore,
        status: "settled",
      });

      for (const mid of extraMatchIds) {
        const snap = await tx.get(adminDb.collection("matches").doc(mid));
        if (snap.exists) otherMatches.set(mid, snap.data() as Match);
      }
      for (const mk of extraMarketIds) {
        const snap = await tx.get(adminDb.collection("markets").doc(mk));
        if (snap.exists) marketsById.set(mk, snap.data() as Market);
      }

      const uids = Array.from(
        new Set(Array.from(betMap.values()).map((b) => b.uid))
      );
      const walletRefs = new Map(
        uids.map((uid) => [uid, adminDb.collection("wallets").doc(uid)] as const)
      );
      const walletSnaps = await Promise.all(
        Array.from(walletRefs.values()).map((ref) => tx.get(ref))
      );
      const walletsByUid = new Map(
        uids.map((uid, i) => {
          const data = walletSnaps[i]?.data() as Wallet | undefined;
          return [uid, data] as const;
        })
      );

      const now = Date.now();

      tx.update(matchRef, {
        status: "settled",
        homeScore,
        awayScore,
        currentHomeScore: homeScore,
        currentAwayScore: awayScore,
        updatedAt: now,
      });

      for (const marketDoc of marketsSnap.docs) {
        tx.update(marketDoc.ref, { status: "settled", updatedAt: now });
      }

      let betsSettled = 0;

      for (const bet of betMap.values()) {
        const legs = betLegs(bet);
        const legStatuses: BetLegStatus[] = [];

        for (const leg of legs) {
          const m = otherMatches.get(leg.matchId);
          const market = marketsById.get(leg.marketId);

          if (!m || !market) {
            legStatuses.push("pending");
            continue;
          }

          const settledLike =
            m.status === "settled" ||
            m.status === "finished" ||
            m.status === "result_confirmed" ||
            leg.matchId === matchId;

          if (!settledLike || m.homeScore == null || m.awayScore == null) {
            if (leg.matchId === matchId) {
              const r = resolveSelectionAgainstScore(
                market,
                leg.selectionId,
                homeScore,
                awayScore
              );
              legStatuses.push(r === "pending" ? "lost" : r);
            } else {
              legStatuses.push("pending");
            }
            continue;
          }

          const hs = leg.matchId === matchId ? homeScore : (m.homeScore as number);
          const as = leg.matchId === matchId ? awayScore : (m.awayScore as number);
          const r = resolveSelectionAgainstScore(
            market,
            leg.selectionId,
            hs,
            as
          );
          legStatuses.push(r === "pending" ? "lost" : r);
        }

        const updatedLegs: BetLeg[] = legs.map((leg, i) => ({
          ...leg,
          status: legStatuses[i] ?? "pending",
        }));

        const anyLost = legStatuses.some((s) => s === "lost");
        const anyPending = legStatuses.some((s) => s === "pending");
        const allWon =
          legStatuses.length > 0 && legStatuses.every((s) => s === "won");
        const allVoid =
          legStatuses.length > 0 && legStatuses.every((s) => s === "void");

        const betRef = adminDb.collection("bets").doc(bet.id);
        const wallet = walletsByUid.get(bet.uid);

        if (anyLost) {
          if (bet.status === "open") {
            tx.update(betRef, {
              legs: updatedLegs,
              matchIds: legs.map((l) => l.matchId),
              status: "lost",
              settledAt: now,
              payout: 0,
            });
            betsSettled++;
          } else {
            tx.update(betRef, {
              legs: updatedLegs,
              matchIds: legs.map((l) => l.matchId),
            });
          }
          continue;
        }

        if (allVoid) {
          if (bet.status === "open") {
            if (wallet) {
              const newBalance = wallet.balance + bet.stake;
              tx.update(walletRefs.get(bet.uid)!, {
                balance: newBalance,
                resetPendingSince:
                  newBalance > 0 ? null : wallet.resetPendingSince,
                updatedAt: now,
              });
              walletsByUid.set(bet.uid, { ...wallet, balance: newBalance });

              const transactionRef = adminDb.collection("transactions").doc();
              const transaction: Transaction = {
                id: transactionRef.id,
                uid: bet.uid,
                type: "refund",
                amount: bet.stake,
                balanceAfter: newBalance,
                betId: bet.id,
                createdAt: now,
              };
              tx.set(transactionRef, transaction);
            }
            tx.update(betRef, {
              legs: updatedLegs,
              matchIds: legs.map((l) => l.matchId),
              status: "void",
              settledAt: now,
              payout: 0,
            });
            betsSettled++;
          } else {
            tx.update(betRef, {
              legs: updatedLegs,
              matchIds: legs.map((l) => l.matchId),
            });
          }
          continue;
        }

        if (allWon) {
          if (bet.status === "open") {
            if (wallet) {
              const payout = bet.potentialPayout;
              const newBalance = wallet.balance + payout;
              tx.update(walletRefs.get(bet.uid)!, {
                balance: newBalance,
                resetPendingSince:
                  newBalance > 0 ? null : wallet.resetPendingSince,
                updatedAt: now,
              });
              walletsByUid.set(bet.uid, { ...wallet, balance: newBalance });

              const transactionRef = adminDb.collection("transactions").doc();
              const transaction: Transaction = {
                id: transactionRef.id,
                uid: bet.uid,
                type: "payout",
                amount: payout,
                balanceAfter: newBalance,
                betId: bet.id,
                createdAt: now,
              };
              tx.set(transactionRef, transaction);
            }
            tx.update(betRef, {
              legs: updatedLegs,
              matchIds: legs.map((l) => l.matchId),
              status: "won",
              settledAt: now,
              payout: bet.potentialPayout,
            });
            betsSettled++;
          } else {
            tx.update(betRef, {
              legs: updatedLegs,
              matchIds: legs.map((l) => l.matchId),
            });
          }
          continue;
        }

        if (anyPending) {
          tx.update(betRef, {
            legs: updatedLegs,
            matchIds: legs.map((l) => l.matchId),
          });
        }
      }

      return { alreadySettled: false, betsSettled };
    });

    // Match settled + markets marked settled -> refresh the public cache.
    revalidateTag("fixtures-core");
    revalidateTag("markets");

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not settle match";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
