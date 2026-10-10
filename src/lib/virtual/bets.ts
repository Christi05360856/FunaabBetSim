
import "server-only";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  chipsRef,
  clampChips,
  readChips,
  writeChips,
  writePlay,
} from "@/lib/casino/chipsTx";
import type { VirtualBetLeg } from "@/types/virtual";

const COL = "virtual_bets";

export type StoredVirtualBet = {
  id: string;
  uid: string;
  roundId: string;
  roundIndex: number;
  stake: number;
  legs: VirtualBetLeg[];
  combinedOdds: number;
  status: "open" | "won" | "lost" | "void";
  payout: number;
  createdAt: number;
  settledAt: number | null;
};

export type PlaceResult =
  | { ok: true; bet: StoredVirtualBet; balanceAfter: number }
  | { ok: false; error: string; code: "INSUFFICIENT" | "ERROR" };

/**
 * Takes the stake and saves the bet in ONE transaction: either both happen
 * or neither does, so a failed save can never cost the player their stake.
 */
export async function placeVirtualBetAtomic(input: {
  uid: string;
  roundId: string;
  roundIndex: number;
  stake: number;
  legs: VirtualBetLeg[];
  combinedOdds: number;
}): Promise<PlaceResult> {
  const stake = clampChips(input.stake);
  const id = "VB-" + randomBytes(6).toString("hex").toUpperCase();
  const betRef = adminDb.collection(COL).doc(id);
  const now = Date.now();

  try {
    return await adminDb.runTransaction(async (tx): Promise<PlaceResult> => {
      const balance = await readChips(tx, input.uid);
      if (balance < stake) {
        return { ok: false, error: "Insufficient demo chips", code: "INSUFFICIENT" };
      }
      const bet: StoredVirtualBet = {
        id,
        uid: input.uid,
        roundId: input.roundId,
        roundIndex: input.roundIndex,
        stake,
        legs: input.legs,
        combinedOdds: input.combinedOdds,
        status: "open",
        payout: 0,
        createdAt: now,
        settledAt: null,
      };
      const balanceAfter = writeChips(tx, input.uid, balance - stake, now);
      tx.set(betRef, bet);
      writePlay(
        tx,
        {
          uid: input.uid,
          game: "virtual-football",
          stake,
          payout: 0,
          balanceBefore: balance,
          balanceAfter,
          meta: {
            phase: "stake_hold",
            betId: id,
            roundId: input.roundId,
            combinedOdds: input.combinedOdds,
          },
        },
        now
      );
      return { ok: true, bet, balanceAfter };
    });
  } catch (e) {
    console.error("[placeVirtualBetAtomic]", e);
    return { ok: false, error: "Could not place bet", code: "ERROR" };
  }
}

export type SettleResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; alreadySettled: boolean };

/**
 * Settles ONE bet exactly once. The status check and the payout happen in the
 * same transaction, so two simultaneous requests (two tabs, a double tap, a
 * script) cannot both pay the same bet.
 */
export async function settleVirtualBetAtomic(input: {
  betId: string;
  uid: string;
  status: "won" | "lost";
  payout: number;
}): Promise<SettleResult> {
  const betRef = adminDb.collection(COL).doc(input.betId);
  const now = Date.now();
  const payout = input.status === "won" ? clampChips(input.payout) : 0;

  try {
    return await adminDb.runTransaction(async (tx): Promise<SettleResult> => {
      const betSnap = await tx.get(betRef);
      const walletSnap = await tx.get(chipsRef(input.uid));
      if (!betSnap.exists) return { ok: false, alreadySettled: false };
      const bet = betSnap.data() as StoredVirtualBet;
      if (bet.uid !== input.uid || bet.status !== "open") {
        return { ok: false, alreadySettled: true };
      }

      const balance = walletSnap.exists
        ? clampChips(Number((walletSnap.data() as { balance?: number }).balance) || 0)
        : 0;
      const balanceAfter = payout > 0 ? writeChips(tx, input.uid, balance + payout, now) : balance;

      tx.update(betRef, { status: input.status, payout, settledAt: now });
      if (payout > 0) {
        writePlay(
          tx,
          {
            uid: input.uid,
            game: "virtual-football",
            stake: 0,
            payout,
            balanceBefore: balance,
            balanceAfter,
            meta: { phase: "settle", betId: bet.id, roundId: bet.roundId },
          },
          now
        );
      }
      return { ok: true, balanceAfter };
    });
  } catch (e) {
    console.error("[settleVirtualBetAtomic]", e);
    return { ok: false, alreadySettled: false };
  }
}

export async function getOpenBetsForRound(
  uid: string,
  roundId: string
): Promise<StoredVirtualBet[]> {
  const snap = await adminDb
    .collection(COL)
    .where("uid", "==", uid)
    .where("roundId", "==", roundId)
    .where("status", "==", "open")
    .get();
  return snap.docs.map((d) => d.data() as StoredVirtualBet);
}

/* ------------------------------------------------------------------
 * Legacy helpers, kept ONLY so an older bet/settle route still compiles
 * if files are committed one at a time. They are not atomic. The current
 * routes use placeVirtualBetAtomic / settleVirtualBetAtomic above.
 * ------------------------------------------------------------------ */

/** @deprecated use placeVirtualBetAtomic */
export async function placeVirtualBet(input: {
  uid: string;
  roundId: string;
  roundIndex: number;
  stake: number;
  legs: VirtualBetLeg[];
  combinedOdds: number;
}): Promise<StoredVirtualBet> {
  const id = "VB-" + randomBytes(6).toString("hex").toUpperCase();
  const doc: StoredVirtualBet = {
    id,
    uid: input.uid,
    roundId: input.roundId,
    roundIndex: input.roundIndex,
    stake: input.stake,
    legs: input.legs,
    combinedOdds: input.combinedOdds,
    status: "open",
    payout: 0,
    createdAt: Date.now(),
    settledAt: null,
  };
  await adminDb.collection(COL).doc(id).set(doc);
  return doc;
}

/** @deprecated use settleVirtualBetAtomic */
export async function markBetSettled(
  id: string,
  status: "won" | "lost",
  payout: number
): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    status,
    payout,
    settledAt: Date.now(),
  });
}

export async function getRecentBets(
  uid: string,
  limit = 20
): Promise<StoredVirtualBet[]> {
  const snap = await adminDb
    .collection(COL)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as StoredVirtualBet);
}
  
