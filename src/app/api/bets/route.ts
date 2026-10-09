import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { placeBetBodySchema } from "@/lib/validation/schemas";
import {
  canPlaceStake,
  availableToBet,
  isValidPromoTicket,
  cashAvailableForStake,
  promoAvailableForStake,
} from "@/lib/domain/wallet";
import { checkBetLimits, computeCredit } from "@/lib/domain/limits";
import {
  applyStakeReserve,
  buildLedgerEntry,
  normalizeWallet,
  type StakeSplit,
} from "@/lib/domain/ledgerEngine";
import type {
  Bet,
  BetLeg,
  Market,
  Match,
  Transaction,
  Wallet,
} from "@/types/domain";
import { isBettingOpen } from "@/lib/domain/matchClock";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";
import { publicErrorMessage } from "@/lib/security/publicError";
import { requirePlayAllowed } from "@/lib/compliance/gate";

type LegInput = {
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string;
  odds: number;
};

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = decoded.uid;
  const ip = clientIp(request);
  const limited = await enforceRateLimit("place_bet", `uid:${uid}`);
  if (limited) return limited;

  const play = await requirePlayAllowed(uid);
  if (!play.ok) {
    return NextResponse.json(
      { error: play.error, code: play.code },
      { status: play.status }
    );
  }

  const raw = await request.json().catch(() => ({}));
  const idempotencyKey = (
    request.headers.get("idempotency-key") ||
    (typeof (raw as { idempotencyKey?: string }).idempotencyKey === "string"
      ? (raw as { idempotencyKey?: string }).idempotencyKey
      : "") ||
    ""
  )
    .trim()
    .slice(0, 128);

  const parsed = placeBetBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  let legs: LegInput[];
  let stake: number;
  let funding: "auto" | "promo" = "auto";

  if ("legs" in parsed.data) {
    legs = parsed.data.legs;
    stake = parsed.data.stake;
    funding = parsed.data.funding ?? "auto";
  } else {
    const { matchId, marketId, selectionId, stake: s } = parsed.data;
    legs = [
      {
        matchId,
        marketId,
        selectionId,
        selectionLabel: selectionId,
        odds: 1,
      },
    ];
    stake = s;
  }

  const matchIds = new Set(legs.map((l) => l.matchId));
  if (matchIds.size !== legs.length) {
    return NextResponse.json(
      { error: "Each match can only appear once on a ticket" },
      { status: 400 }
    );
  }

  const walletRef = adminDb.collection("wallets").doc(uid);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // Idempotency INSIDE the transaction (H-01) — concurrent same key → one bet
      if (idempotencyKey) {
        const idRef = adminDb
          .collection("bet_idempotency")
          .doc(uid + "_" + idempotencyKey);
        const idSnap = await tx.get(idRef);
        if (idSnap.exists) {
          const prev = idSnap.data() as {
            betId?: string;
            balance?: number;
            potentialPayout?: number;
          };
          return {
            betId: prev.betId ?? "",
            balance: prev.balance ?? 0,
            potentialPayout: prev.potentialPayout ?? 0,
            replayed: true as const,
          };
        }
      }

      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error("Wallet not found");
      const wallet = normalizeWallet(walletSnap.data() as Wallet);
      const avail = availableToBet(wallet);

      if (!canPlaceStake(avail, stake)) {
        throw new Error("Invalid stake for your current balance");
      }

      const validatedLegs: BetLeg[] = [];
      const marketTypes: string[] = [];
      let combinedOdds = 1;

      for (const leg of legs) {
        const matchRef = adminDb.collection("matches").doc(leg.matchId);
        const marketRef = adminDb.collection("markets").doc(leg.marketId);
        const [matchSnap, marketSnap] = await Promise.all([
          tx.get(matchRef),
          tx.get(marketRef),
        ]);
        if (!matchSnap.exists) throw new Error("Match not found");
        if (!marketSnap.exists) throw new Error("Market not found");

        const match = matchSnap.data() as Match;
        const market = marketSnap.data() as Market;

        if (!isBettingOpen(match)) {
          throw new Error("Betting is closed for one or more selections");
        }
        if (market.status !== "active") {
          throw new Error("Market is not open for betting");
        }
        if (market.matchId !== match.id) {
          throw new Error("Market does not belong to match");
        }

        const selection = market.selections.find((s) => s.id === leg.selectionId);
        if (!selection) throw new Error("Selection not found on market");
        if (
          (selection as { suspended?: boolean }).suspended === true ||
          (selection as { active?: boolean }).active === false
        ) {
          throw new Error("Selection is suspended");
        }

        const liveOdds = Number(selection.odds);
        if (!Number.isFinite(liveOdds) || liveOdds <= 1) {
          throw new Error("Invalid odds on server");
        }
        combinedOdds *= liveOdds;

        validatedLegs.push({
          matchId: leg.matchId,
          marketId: leg.marketId,
          selectionId: selection.id,
          selectionLabel: selection.label,
          marketType: market.type,
          odds: liveOdds,
        });
        marketTypes.push(market.type);
      }

      if (validatedLegs.length === 0) {
        throw new Error("No valid selections on this ticket");
      }

      const limitError = checkBetLimits({
        stake,
        legCount: validatedLegs.length,
        combinedOdds,
      });
      if (limitError) throw new Error(limitError);

      // Cash first. Promo points are only touched when asked for (funding
      // "promo") or when cash runs out, and then the promo ticket rules apply.
      const cashFree = cashAvailableForStake(wallet);
      const promoFree = promoAvailableForStake(wallet);
      let intended: StakeSplit;
      if (funding === "promo") {
        if (promoFree < stake) {
          throw new Error("Insufficient promo points for this stake");
        }
        intended = { fromPurchased: 0, fromPromo: stake };
      } else {
        const fromPurchased = Math.min(stake, cashFree);
        const fromPromo = stake - fromPurchased;
        if (fromPromo > promoFree) throw new Error("Insufficient balance");
        intended = { fromPurchased, fromPromo };
      }
      if (intended.fromPromo > 0) {
        const rules = wallet.promoBetRules ?? null;
        if (!isValidPromoTicket(validatedLegs, marketTypes, rules)) {
          throw new Error(
            rules?.terms ||
              "Promo points can only be used on tickets that meet the promo rules. Use cash or choose a qualifying ticket."
          );
        }
      }

      const now = Date.now();
      const balanceBefore = avail;
      const { wallet: nextWallet, split } = applyStakeReserve(
        wallet,
        stake,
        intended
      );
      // Credit on a win: promo stake is not returned, and max win applies.
      const potentialPayout = computeCredit(stake, combinedOdds, split.fromPromo);
      const isAcca = validatedLegs.length > 1;
      const first = validatedLegs[0]!;

      const betRef = adminDb.collection("bets").doc();
      const ticketCode = betRef.id.toUpperCase();
      const bet: Bet = {
        matchIds: validatedLegs.map((l) => l.matchId),
        id: betRef.id,
        ticketCode,
        uid,
        userId: uid,
        type: isAcca ? "accumulator" : "single",
        legs: validatedLegs,
        matchId: first.matchId,
        marketId: first.marketId,
        selectionId: first.selectionId,
        selectionLabel: first.selectionLabel,
        oddsAtPlacement: combinedOdds,
        stake,
        stakePurchased: split.fromPurchased,
        stakePromo: split.fromPromo,
        snr: true,
        potentialPayout,
        status: "open",
        placedAt: now,
        settledAt: null,
        hidden: false,
      };

      const transactionRef = adminDb.collection("transactions").doc();
      const transaction: Transaction = {
        id: transactionRef.id,
        uid,
        type: "debit_bet",
        amount: -stake,
        balanceAfter: nextWallet.balance,
        balanceBefore,
        betId: betRef.id,
        status: "success",
        createdAt: now,
      };

      const ledgerRef = adminDb.collection("ledger").doc();
      const ledger = buildLedgerEntry({
        id: ledgerRef.id,
        uid,
        type: "BET_STAKE_RESERVE",
        amount: -stake,
        balanceBefore,
        balanceAfter: nextWallet.balance,
        betId: betRef.id,
        metadata: {
          fromPurchased: split.fromPurchased,
          fromPromo: split.fromPromo,
        },
        now,
      });

      tx.update(walletRef, {
        purchased: nextWallet.purchased,
        promo: nextWallet.promo,
        reservedStake: nextWallet.reservedStake,
        reservedWithdrawal: nextWallet.reservedWithdrawal,
        reservedPromoStake: nextWallet.reservedPromoStake,
        turnoverDone: nextWallet.turnoverDone,
        balance: nextWallet.balance,
        lifetimeWagering: nextWallet.lifetimeWagering,
        resetPendingSince: null,
        updatedAt: now,
      });
      tx.set(betRef, bet);
      tx.set(transactionRef, transaction);
      tx.set(ledgerRef, ledger);

      if (idempotencyKey) {
        const idRef = adminDb
          .collection("bet_idempotency")
          .doc(uid + "_" + idempotencyKey);
        tx.set(idRef, {
          uid,
          betId: betRef.id,
          balance: nextWallet.balance,
          potentialPayout,
          createdAt: now,
        });
      }

      return {
        betId: betRef.id,
        balance: nextWallet.balance,
        potentialPayout,
        replayed: false as const,
      };
    });

    void securityLog({
      type: "BET_PLACED",
      uid,
      ip,
      meta: { betId: result.betId, stake },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = publicErrorMessage(err, "Could not place bet. Please try again.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
      }




      
