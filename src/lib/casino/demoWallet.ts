import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  CASINO_MAX_STAKE,
  CASINO_MIN_STAKE,
  CASINO_RELOAD_CHIPS,
  CASINO_RELOAD_COOLDOWN_MS,
  CASINO_START_CHIPS,
  type CasinoDemoWallet,
} from "@/types/casino";

const COL = "casino_wallets";
const PLAYS = "casino_plays";

function clampChips(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n * 100) / 100;
}

export async function ensureCasinoDemoWallet(uid: string): Promise<CasinoDemoWallet> {
  const ref = adminDb.collection(COL).doc(uid);
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data() as CasinoDemoWallet;
      return {
        uid,
        balance: clampChips(d.balance ?? 0),
        startedAt: d.startedAt ?? now,
        lastReloadAt: d.lastReloadAt ?? null,
        updatedAt: d.updatedAt ?? now,
      } satisfies CasinoDemoWallet;
    }
    const fresh: CasinoDemoWallet = {
      uid,
      balance: CASINO_START_CHIPS,
      startedAt: now,
      lastReloadAt: null,
      updatedAt: now,
    };
    tx.set(ref, fresh);
    return fresh;
  });
}

export type ReloadResult =
  | { ok: true; wallet: CasinoDemoWallet; credited: number }
  | {
      ok: false;
      error: string;
      code: "NOT_EMPTY" | "COOLDOWN" | "UNAUTHORIZED";
      wallet?: CasinoDemoWallet;
      retryAfterMs?: number;
    };

export async function reloadCasinoDemoWallet(uid: string): Promise<ReloadResult> {
  const ref = adminDb.collection(COL).doc(uid);
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let wallet: CasinoDemoWallet;

    if (!snap.exists) {
      wallet = {
        uid,
        balance: CASINO_START_CHIPS,
        startedAt: now,
        lastReloadAt: null,
        updatedAt: now,
      };
      tx.set(ref, wallet);
      return {
        ok: false as const,
        error: "Balance is not zero — reload only when empty",
        code: "NOT_EMPTY" as const,
        wallet,
      };
    }

    const d = snap.data() as CasinoDemoWallet;
    wallet = {
      uid,
      balance: clampChips(d.balance ?? 0),
      startedAt: d.startedAt ?? now,
      lastReloadAt: d.lastReloadAt ?? null,
      updatedAt: d.updatedAt ?? now,
    };

    if (wallet.balance > 0) {
      return {
        ok: false as const,
        error: "Reload is only available when demo balance is 0",
        code: "NOT_EMPTY" as const,
        wallet,
      };
    }

    if (wallet.lastReloadAt != null) {
      const elapsed = now - wallet.lastReloadAt;
      if (elapsed < CASINO_RELOAD_COOLDOWN_MS) {
        return {
          ok: false as const,
          error: "Reload cooldown active",
          code: "COOLDOWN" as const,
          wallet,
          retryAfterMs: CASINO_RELOAD_COOLDOWN_MS - elapsed,
        };
      }
    }

    const next: CasinoDemoWallet = {
      ...wallet,
      balance: CASINO_RELOAD_CHIPS,
      lastReloadAt: now,
      updatedAt: now,
    };
    tx.set(ref, next);
    return { ok: true as const, wallet: next, credited: CASINO_RELOAD_CHIPS };
  });
}

export function reloadAvailability(wallet: CasinoDemoWallet, now = Date.now()) {
  const empty = wallet.balance <= 0;
  if (!empty) {
    return { canReload: false as const, reason: "not_empty" as const, retryAfterMs: 0 };
  }
  if (wallet.lastReloadAt == null) {
    return { canReload: true as const, reason: null, retryAfterMs: 0 };
  }
  const elapsed = now - wallet.lastReloadAt;
  if (elapsed >= CASINO_RELOAD_COOLDOWN_MS) {
    return { canReload: true as const, reason: null, retryAfterMs: 0 };
  }
  return {
    canReload: false as const,
    reason: "cooldown" as const,
    retryAfterMs: CASINO_RELOAD_COOLDOWN_MS - elapsed,
  };
}

export type SettlePlayInput = {
  uid: string;
  game: string;
  stake: number;
  /** Gross return on win (includes stake). 0 on loss. */
  payout: number;
  meta: Record<string, unknown>;
};

export type SettlePlayResult =
  | {
      ok: true;
      playId: string;
      balanceAfter: number;
      balanceBefore: number;
    }
  | { ok: false; error: string; code: "INSUFFICIENT" | "INVALID_STAKE" | "ERROR" };

/**
 * Debit stake, credit payout in one transaction. Writes casino_plays audit row.
 * Never touches sports wallets.
 */
export async function settleCasinoPlay(input: SettlePlayInput): Promise<SettlePlayResult> {
  const stake = clampChips(input.stake);
  const payout = clampChips(input.payout);

  if (stake < CASINO_MIN_STAKE) {
    return { ok: false, error: `Minimum stake is ${CASINO_MIN_STAKE}`, code: "INVALID_STAKE" };
  }
  if (stake > CASINO_MAX_STAKE) {
    return { ok: false, error: `Maximum stake is ${CASINO_MAX_STAKE}`, code: "INVALID_STAKE" };
  }

  const ref = adminDb.collection(COL).doc(input.uid);
  const playRef = adminDb.collection(PLAYS).doc();
  const now = Date.now();

  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let wallet: CasinoDemoWallet;
      if (!snap.exists) {
        wallet = {
          uid: input.uid,
          balance: CASINO_START_CHIPS,
          startedAt: now,
          lastReloadAt: null,
          updatedAt: now,
        };
        tx.set(ref, wallet);
      } else {
        const d = snap.data() as CasinoDemoWallet;
        wallet = {
          uid: input.uid,
          balance: clampChips(d.balance ?? 0),
          startedAt: d.startedAt ?? now,
          lastReloadAt: d.lastReloadAt ?? null,
          updatedAt: d.updatedAt ?? now,
        };
      }

      if (wallet.balance < stake) {
        return {
          ok: false as const,
          error: "Insufficient demo chips",
          code: "INSUFFICIENT" as const,
        };
      }

      const balanceBefore = wallet.balance;
      // Remove stake, add payout (payout is 0 on loss)
      const balanceAfter = clampChips(balanceBefore - stake + payout);

      tx.set(ref, {
        ...wallet,
        balance: balanceAfter,
        updatedAt: now,
      });

      tx.set(playRef, {
        id: playRef.id,
        uid: input.uid,
        game: input.game,
        stake,
        payout,
        profit: clampChips(payout - stake),
        balanceBefore,
        balanceAfter,
        meta: input.meta,
        createdAt: now,
      });

      return {
        ok: true as const,
        playId: playRef.id,
        balanceAfter,
        balanceBefore,
      };
    });
  } catch (e) {
    console.error("[settleCasinoPlay]", e);
    return { ok: false, error: "Play settlement failed", code: "ERROR" };
  }
}
