import "server-only";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { VIRTUAL_ROUND_TTL_MS, type VirtualRoundPublic } from "@/types/virtual";
import {
  generateRoundMatches,
  publicMatch,
  type VirtualMatchInternal,
} from "./engine";

const COL = "virtual_rounds";

function newRoundId(): string {
  return "VR-" + randomBytes(6).toString("hex").toUpperCase();
}

export type StoredRound = {
  id: string;
  createdAt: number;
  expiresAt: number;
  matches: VirtualMatchInternal[];
};

export async function createVirtualRound(): Promise<{
  public: VirtualRoundPublic;
  stored: StoredRound;
}> {
  const now = Date.now();
  const id = newRoundId();
  const matches = generateRoundMatches();
  const stored: StoredRound = {
    id,
    createdAt: now,
    expiresAt: now + VIRTUAL_ROUND_TTL_MS,
    matches,
  };
  await adminDb.collection(COL).doc(id).set(stored);
  return {
    stored,
    public: {
      id,
      createdAt: now,
      expiresAt: stored.expiresAt,
      matches: matches.map(publicMatch),
    },
  };
}

export async function getVirtualRound(
  id: string
): Promise<StoredRound | null> {
  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as StoredRound;
}
