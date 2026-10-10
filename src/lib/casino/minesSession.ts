import "server-only";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { makePrng, gameSeed, lagosDayKey, sha256Hex } from "@/lib/fair/commit";
import { minesMultiplier } from "@/lib/casino/mines";
import {
  chipsRef,
  clampChips,
  readChips,
  writeChips,
  writePlay,
} from "@/lib/casino/chipsTx";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
} from "@/types/casino";

const COL = "casino_mines_sessions";

export type MinesSession = {
  id: string;
  uid: string;
  stake: number;
  mineCount: number;
  mines: number[];
  revealed: number[];
  status: "active" | "busted" | "cashed";
  /** Fairness: hash shown at the start; the seed is shown when the game ends. */
  seed: string;
  seedHash: string;
  dayKey: string;
  createdAt: number;
};

export type Fail = { ok: false; error: string };

export function validateMinesSessionStart(raw: {
  stake?: unknown;
  mineCount?: unknown;
}) {
  const stake = Number(raw.stake);
  const mineCount = Number(raw.mineCount);
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false as const, error: "Invalid stake" };
  }
  if (stake < CASINO_MIN_STAKE || stake > CASINO_MAX_STAKE) {
    return {
      ok: false as const,
      error: `Stake ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE}`,
    };
  }
  if (!Number.isInteger(mineCount) || mineCount < MINES_MIN || mineCount > MINES_MAX) {
    return {
      ok: false as const,
      error: `Mines must be ${MINES_MIN}–${MINES_MAX}`,
    };
  }
  return {
    ok: true as const,
    stake: Math.floor(stake * 100) / 100,
    mineCount,
  };
}

function layoutFromSeed(seed: string, mineCount: number): number[] {
  const rand = makePrng(seed);
  const order = Array.from({ length: MINES_GRID }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = order[i] as number;
    const b = order[j] as number;
    order[i] = b;
    order[j] = a;
  }
  return order.slice(0, mineCount);
}

/** Takes the stake and creates the session in one transaction. */
export async function startMinesSession(input: {
  uid: string;
  stake: number;
  mineCount: number;
}): Promise<
  | { ok: true; session: MinesSession; balance: number }
  | Fail
> {
  const id = "MN-" + randomBytes(8).toString("hex").toUpperCase();
  const now = Date.now();
  const dayKey = lagosDayKey(now);
  const seed = gameSeed("mines", id, dayKey);
  const session: MinesSession = {
    id,
    uid: input.uid,
    stake: clampChips(input.stake),
    mineCount: input.mineCount,
    mines: layoutFromSeed(seed, input.mineCount),
    revealed: [],
    status: "active",
    seed,
    seedHash: sha256Hex(seed),
    dayKey,
    createdAt: now,
  };
  const ref = adminDb.collection(COL).doc(id);

  try {
    return await adminDb.runTransaction(
      async (tx): Promise<{ ok: true; session: MinesSession; balance: number } | Fail> => {
        const balance = await readChips(tx, input.uid);
        if (balance < session.stake) {
          return { ok: false, error: "Insufficient demo chips" };
        }
        const after = writeChips(tx, input.uid, balance - session.stake, now);
        tx.set(ref, session);
        writePlay(
          tx,
          {
            uid: input.uid,
            game: "mines",
            stake: session.stake,
            payout: 0,
            balanceBefore: balance,
            balanceAfter: after,
            meta: { phase: "session_start", sessionId: id, mines: session.mineCount },
          },
          now
        );
        return { ok: true, session, balance: after };
      }
    );
  } catch (e) {
    console.error("[startMinesSession]", e);
    return { ok: false, error: "Could not start the game. Try again." };
  }
}

/** Reveal one tile. Runs in a transaction, so parallel taps cannot cheat. */
export async function revealMinesTile(input: {
  uid: string;
  sessionId: string;
  tile: number;
}): Promise<
  | {
      ok: true;
      hit: boolean;
      revealed: number[];
      status: MinesSession["status"];
      multiplier: number;
      mines?: number[];
      seed?: string;
    }
  | Fail
> {
  if (!Number.isInteger(input.tile) || input.tile < 0 || input.tile >= MINES_GRID) {
    return { ok: false, error: "Invalid tile" };
  }
  const ref = adminDb.collection(COL).doc(input.sessionId);
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, error: "Session not found" };
      const s = snap.data() as MinesSession;
      if (s.uid !== input.uid) return { ok: false as const, error: "Session not found" };
      if (s.status !== "active") return { ok: false as const, error: "Session closed" };
      if (s.revealed.includes(input.tile)) {
        return { ok: false as const, error: "Already revealed" };
      }
      const hit = s.mines.includes(input.tile);
      const revealed = [...s.revealed, input.tile];
      const status: MinesSession["status"] = hit ? "busted" : "active";
      tx.update(ref, { revealed, status });
      return {
        ok: true as const,
        hit,
        revealed,
        status,
        multiplier: hit ? 0 : minesMultiplier(s.mineCount, revealed.length),
        mines: hit ? s.mines : undefined,
        seed: hit ? s.seed : undefined,
      };
    });
  } catch (e) {
    console.error("[revealMinesTile]", e);
    return { ok: false, error: "Reveal failed. Try again." };
  }
}

/** Cash out: marks the session closed and pays, in one transaction. */
export async function cashoutMinesSession(input: {
  uid: string;
  sessionId: string;
}): Promise<
  | {
      ok: true;
      multiplier: number;
      payout: number;
      profit: number;
      balance: number;
      mines: number[];
      seed: string;
    }
  | Fail
> {
  const ref = adminDb.collection(COL).doc(input.sessionId);
  const now = Date.now();
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const wallet = await tx.get(chipsRef(input.uid));
      if (!snap.exists) return { ok: false as const, error: "Session not found" };
      const s = snap.data() as MinesSession;
      if (s.uid !== input.uid) return { ok: false as const, error: "Session not found" };
      if (s.status !== "active") return { ok: false as const, error: "Session closed" };
      if (s.revealed.length < 1) {
        return { ok: false as const, error: "Reveal at least one tile" };
      }
      const multiplier = minesMultiplier(s.mineCount, s.revealed.length);
      const payout = Math.floor(s.stake * multiplier * 100) / 100;
      const balance = wallet.exists
        ? clampChips(Number((wallet.data() as { balance?: number }).balance) || 0)
        : 0;
      const after = writeChips(tx, input.uid, balance + payout, now);
      tx.update(ref, { status: "cashed" });
      writePlay(
        tx,
        {
          uid: input.uid,
          game: "mines",
          stake: 0,
          payout,
          balanceBefore: balance,
          balanceAfter: after,
          meta: { phase: "cashout", sessionId: s.id, multiplier },
        },
        now
      );
      return {
        ok: true as const,
        multiplier,
        payout,
        profit: Math.floor((payout - s.stake) * 100) / 100,
        balance: after,
        mines: s.mines,
        seed: s.seed,
      };
    });
  } catch (e) {
    console.error("[cashoutMinesSession]", e);
    return { ok: false, error: "Cash out failed. Try again." };
  }
}
