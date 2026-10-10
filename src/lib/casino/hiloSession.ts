import "server-only";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { makePrng, gameSeed, lagosDayKey, sha256Hex } from "@/lib/fair/commit";
import { hiloMultiplier, hiloWinProbability } from "@/lib/casino/hilo";
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
  HILO_MAX,
  HILO_MIN,
  type HiloChoice,
} from "@/types/casino";

const COL = "casino_hilo_sessions";
/** Once the streak is worth this much, the player must cash out. */
export const HILO_MAX_MULTIPLIER = 100;
const CARDS = HILO_MAX - HILO_MIN + 1;

export type HiloSession = {
  id: string;
  uid: string;
  stake: number;
  card: number;
  streak: number;
  multiplier: number;
  status: "active" | "busted" | "cashed";
  step: number;
  seed: string;
  seedHash: string;
  dayKey: string;
  createdAt: number;
};

export type Fail = { ok: false; error: string };

/** What each choice would pay from this card (0 = impossible). */
export function hiloOdds(card: number): { higher: number; lower: number } {
  return {
    higher: hiloMultiplier(card, "higher"),
    lower: hiloMultiplier(card, "lower"),
  };
}

export function validateHiloSessionStart(raw: { stake?: unknown }) {
  const stake = Number(raw.stake);
  if (!Number.isFinite(stake) || stake < CASINO_MIN_STAKE || stake > CASINO_MAX_STAKE) {
    return {
      ok: false as const,
      error: `Stake ${CASINO_MIN_STAKE}–${CASINO_MAX_STAKE}`,
    };
  }
  return { ok: true as const, stake: Math.floor(stake * 100) / 100 };
}

export async function startHiloSession(input: {
  uid: string;
  stake: number;
}): Promise<
  | { ok: true; session: HiloSession; balance: number }
  | Fail
> {
  const id = "HL-" + randomBytes(8).toString("hex").toUpperCase();
  const now = Date.now();
  const dayKey = lagosDayKey(now);
  const seed = gameSeed("hilo", id, dayKey);
  const card = HILO_MIN + Math.floor(makePrng(seed)() * CARDS);
  const session: HiloSession = {
    id,
    uid: input.uid,
    stake: clampChips(input.stake),
    card,
    streak: 0,
    multiplier: 1,
    status: "active",
    step: 0,
    seed,
    seedHash: sha256Hex(seed),
    dayKey,
    createdAt: now,
  };
  const ref = adminDb.collection(COL).doc(id);
  try {
    return await adminDb.runTransaction(
      async (tx): Promise<{ ok: true; session: HiloSession; balance: number } | Fail> => {
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
            game: "hilo",
            stake: session.stake,
            payout: 0,
            balanceBefore: balance,
            balanceAfter: after,
            meta: { phase: "session_start", sessionId: id },
          },
          now
        );
        return { ok: true, session, balance: after };
      }
    );
  } catch (e) {
    console.error("[startHiloSession]", e);
    return { ok: false, error: "Could not start the game. Try again." };
  }
}

/**
 * One guess. The next card comes from the session seed + step number, and the
 * payout for a correct guess is 0.99 / its true probability, so no choice is
 * better than any other. Runs in a transaction: parallel guesses are applied
 * one after another, never both against the same card.
 */
export async function guessHilo(input: {
  uid: string;
  sessionId: string;
  choice: HiloChoice;
}): Promise<
  | {
      ok: true;
      won: boolean;
      prev: number;
      card: number;
      streak: number;
      multiplier: number;
      status: HiloSession["status"];
      stepMultiplier: number;
      odds: { higher: number; lower: number };
      seed?: string;
    }
  | Fail
> {
  const ref = adminDb.collection(COL).doc(input.sessionId);
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, error: "Session not found" };
      const s = snap.data() as HiloSession;
      if (s.uid !== input.uid) return { ok: false as const, error: "Session not found" };
      if (s.status !== "active") return { ok: false as const, error: "Session closed" };
      if (hiloWinProbability(s.card, input.choice) <= 0) {
        return {
          ok: false as const,
          error:
            input.choice === "higher"
              ? "Nothing is higher than a King — choose lower"
              : "Nothing is lower than an Ace — choose higher",
        };
      }
      if (s.multiplier >= HILO_MAX_MULTIPLIER) {
        return { ok: false as const, error: "Maximum reached. Cash out now." };
      }

      const rand = makePrng(`${s.seed}:step:${s.step}`);
      const next = HILO_MIN + Math.floor(rand() * CARDS);
      const won = input.choice === "higher" ? next > s.card : next < s.card;
      const stepMultiplier = hiloMultiplier(s.card, input.choice);

      if (!won) {
        tx.update(ref, { status: "busted", card: next, step: s.step + 1 });
        return {
          ok: true as const,
          won: false,
          prev: s.card,
          card: next,
          streak: s.streak,
          multiplier: 0,
          status: "busted" as const,
          stepMultiplier,
          odds: hiloOdds(next),
          seed: s.seed,
        };
      }

      const streak = s.streak + 1;
      const multiplier = Math.floor(s.multiplier * stepMultiplier * 100) / 100;
      tx.update(ref, { card: next, streak, multiplier, step: s.step + 1 });
      return {
        ok: true as const,
        won: true,
        prev: s.card,
        card: next,
        streak,
        multiplier,
        status: "active" as const,
        stepMultiplier,
        odds: hiloOdds(next),
      };
    });
  } catch (e) {
    console.error("[guessHilo]", e);
    return { ok: false, error: "Guess failed. Try again." };
  }
}

export async function cashoutHilo(input: {
  uid: string;
  sessionId: string;
}): Promise<
  | {
      ok: true;
      payout: number;
      multiplier: number;
      profit: number;
      balance: number;
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
      const s = snap.data() as HiloSession;
      if (s.uid !== input.uid) return { ok: false as const, error: "Session not found" };
      if (s.status !== "active") return { ok: false as const, error: "Session closed" };
      if (s.streak < 1) {
        return { ok: false as const, error: "Win at least one step first" };
      }
      const payout = Math.floor(s.stake * s.multiplier * 100) / 100;
      const balance = wallet.exists
        ? clampChips(Number((wallet.data() as { balance?: number }).balance) || 0)
        : 0;
      const after = writeChips(tx, input.uid, balance + payout, now);
      tx.update(ref, { status: "cashed" });
      writePlay(
        tx,
        {
          uid: input.uid,
          game: "hilo",
          stake: 0,
          payout,
          balanceBefore: balance,
          balanceAfter: after,
          meta: { phase: "cashout", sessionId: s.id, multiplier: s.multiplier },
        },
        now
      );
      return {
        ok: true as const,
        payout,
        multiplier: s.multiplier,
        profit: Math.floor((payout - s.stake) * 100) / 100,
        balance: after,
        seed: s.seed,
      };
    });
  } catch (e) {
    console.error("[cashoutHilo]", e);
    return { ok: false, error: "Cash out failed. Try again." };
  }
}
