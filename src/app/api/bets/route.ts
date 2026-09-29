import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import { placeBetBodySchema } from "@/lib/validation/schemas";
import { canPlaceStake, availableToBet } from "@/lib/domain/wallet";
import {
  applyStakeReserve,
  buildLedgerEntry,
  normalizeWallet,
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

  const raw = await request.json().catch(() => ({}));
  const parsed = placeBetBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  let legs: LegInput[];
  let stake: number;

  if ("legs" in parsed.data) {
    legs = parsed.data.legs;
    stake = parsed.data.stake;
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
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error("Wallet not found");
      const wallet = normalizeWallet(walletSnap.data() as Wallet);
      const avail = availableToBet(wallet);

      if (!canPlaceStake(avail, stake)) {
        throw new Error("Invalid stake for your current balance");
      }

      const validatedLegs: BetLeg[] = [];
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

        const liveOdds = selection.odds;
        combinedOdds *= liveOdds;

        validatedLegs.push({
          matchId: leg.matchId,
          marketId: leg.marketId,
          selectionId: selection.id,
          selectionLabel: selection.label,
          odds: liveOdds,
        });
      }

      if (validatedLegs.length === 0) {
        throw new Error("No valid selections on this ticket");
      }

      const now = Date.now();
      const potentialPayout = Math.round(stake * combinedOdds);
      const balanceBefore = avail;
      const { wallet: nextWallet, split } = applyStakeReserve(wallet, stake);
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
        balance: nextWallet.balance,
        lifetimeWagering: nextWallet.lifetimeWagering,
        resetPendingSince: null,
        updatedAt: now,
      });
      tx.set(betRef, bet);
      tx.set(transactionRef, transaction);
      tx.set(ledgerRef, ledger);

      return {
        betId: betRef.id,
        balance: nextWallet.balance,
        potentialPayout,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not place bet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
