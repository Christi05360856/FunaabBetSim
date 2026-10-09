import "server-only";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
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
