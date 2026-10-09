import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyWithdrawalRequest,
  buildLedgerEntry,
  normalizeWallet,
} from "@/lib/domain/ledgerEngine";
import { turnoverRemaining, withdrawableBalance } from "@/lib/domain/wallet";
import {
  MAX_WITHDRAWAL,
  MIN_WITHDRAWAL,
  type Wallet,
  type Withdrawal,
} from "@/types/domain";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { securityLog } from "@/lib/security/securityLog";
import {
  requireRecentAuth,
  requireAccountAge,
  requireStablePayoutDestination,
  normalizeAccountName,
} from "@/lib/security/sessionGate";
import { isValidPinFormat, verifyPin } from "@/lib/security/withdrawPin";
import { clearPinAttempts, reservePinAttempt } from "@/lib/security/pinAttempts";
import { publicErrorMessage } from "@/lib/security/publicError";
import { startOfLagosDayMs } from "@/lib/time/lagosDay";

export async function POST(request: NextRequest) {
  const decoded = await verifyRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = decoded.uid;
  const ip = clientIp(request);
  const limited = await enforceRateLimit("withdraw_request", `uid:${uid}`);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount));
  const bankCode = String(body.bankCode ?? "").trim();
  const accountNumber = String(body.accountNumber ?? "").replace(/\s/g, "");
  const accountName = String(body.accountName ?? "").trim();
  const pin = String(body.pin ?? "").trim();

  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString("en-NG")}` },
      { status: 400 }
    );
  }
  if (amount > MAX_WITHDRAWAL) {
    return NextResponse.json(
      { error: `Maximum per request is ₦${MAX_WITHDRAWAL.toLocaleString("en-NG")}` },
      { status: 400 }
    );
  }
  if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json(
      { error: "Valid bank and 10-digit account number required" },
      { status: 400 }
    );
  }
  if (accountName.length < 5) {
    return NextResponse.json(
      { error: "Account name is required (must match bank records)" },
      { status: 400 }
    );
  }
  const normalizedName = normalizeAccountName(accountName);
  if (normalizedName.length < 3) {
    return NextResponse.json(
      { error: "Account name must contain a valid name (letters)" },
      { status: 400 }
    );
  }

  // Phase 3 — session & account gates
  const recent = requireRecentAuth(decoded);
  if (!recent.ok) {
    return NextResponse.json({ error: recent.error }, { status: 401 });
  }
  const ageGate = await requireAccountAge(uid);
  if (!ageGate.ok) {
    return NextResponse.json({ error: ageGate.error }, { status: 403 });
  }
  const payoutLock = await requireStablePayoutDestination(uid, bankCode, accountNumber);
  if (!payoutLock.ok) {
    return NextResponse.json({ error: payoutLock.error }, { status: 403 });
  }

  // KYC must be verified before cash leaves the platform
  const kycSnap = await adminDb.collection("kyc").doc(uid).get();
  const kyc = kycSnap.exists ? kycSnap.data() : null;
  if (!kyc || kyc.status !== "verified") {
    return NextResponse.json(
      {
        error:
          !kyc || kyc.status === "none"
            ? "Complete identity verification (KYC) before withdrawing. Open Account → Verify identity."
            : kyc.status === "pending"
              ? "Your KYC is still under review. Withdrawals unlock after approval."
              : "Your KYC was rejected. Update details under Account → Verify identity.",
        code: "kyc_required",
        kycStatus: kyc?.status ?? "none",
      },
      { status: 403 }
    );
  }
  // Payout destination is locked to verified KYC (bank + number + name).
  const kycBank = String(kyc.bankCode ?? "").trim();
  const kycAcct = String(kyc.accountNumber ?? "").replace(/\s/g, "");
  const kycNameNorm = normalizeAccountName(String(kyc.accountName ?? ""));
  if (!kycBank || !kycAcct || kycNameNorm.length < 3) {
    return NextResponse.json(
      {
        error:
          "Your KYC bank details are incomplete. Update Verify identity or contact support.",
        code: "kyc_incomplete",
      },
      { status: 403 }
    );
  }
  if (kycBank !== bankCode || kycAcct !== accountNumber) {
    return NextResponse.json(
      {
        error:
          "Withdrawal bank must match your verified KYC details. Contact support if your bank changed.",
        code: "kyc_bank_mismatch",
      },
      { status: 403 }
    );
  }
  // Name must match verified KYC (stops typing a different beneficiary on same NUBAN)
  if (normalizedName !== kycNameNorm) {
    return NextResponse.json(
      {
        error:
          "Account name must match your verified KYC name exactly. You cannot change the beneficiary after verification.",
        code: "kyc_name_mismatch",
      },
      { status: 403 }
    );
  }
  // Always persist the verified KYC name (not a free-typed variant)
  const lockedAccountName = String(kyc.accountName ?? "").trim();

  // Withdrawal PIN required once set (and must be set for cash-out)
  const pinSnap = await adminDb.collection("user_security").doc(uid).get();
  const pinDoc = (pinSnap.data() ?? {}) as {
    pinHash?: string;
    pinSalt?: string;
  };
  if (!pinDoc.pinHash || !pinDoc.pinSalt) {
    return NextResponse.json(
      {
        error: "Set a 4-digit withdrawal PIN under Account → Settings before withdrawing.",
        code: "pin_required",
      },
      { status: 403 }
    );
  }
  // Count the attempt atomically BEFORE checking the PIN, so parallel
  // requests cannot out-run the 5-attempt limit.
  const attempt = await reservePinAttempt(uid);
  if (!attempt.ok) {
    const mins = Math.max(1, Math.ceil((attempt.lockedUntil - Date.now()) / 60000));
    return NextResponse.json(
      {
        error: `Withdrawal PIN locked. Try again in about ${mins} minute(s).`,
        code: "pin_locked",
      },
      { status: 429 }
    );
  }
  if (!isValidPinFormat(pin) || !verifyPin(pin, pinDoc.pinSalt, pinDoc.pinHash)) {
    void securityLog({ type: "PIN_FAIL", uid, ip });
    return NextResponse.json(
      { error: "Incorrect withdrawal PIN", code: "pin_invalid" },
      { status: 403 }
    );
  }
  await clearPinAttempts(uid);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const walletRef = adminDb.collection("wallets").doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) throw new Error("Wallet not found");
      const wallet = normalizeWallet(walletSnap.data() as Wallet);

      const owed = turnoverRemaining(wallet);
      if (owed > 0) {
        throw new Error(
          `Play through ₦${Math.ceil(owed).toLocaleString("en-NG")} more in bets before withdrawing. Deposits must be wagered first.`
        );
      }

      const free = withdrawableBalance(wallet);
      if (amount > free) {
        throw new Error(
          `Withdrawable balance is ₦${free.toLocaleString("en-NG")} (promo points cannot be withdrawn)`
        );
      }

      // Daily cap + single pending (filter in memory — avoids composite index)
      const dayStart = startOfLagosDayMs();
      const todayQ = await tx.get(
        adminDb.collection("withdrawals").where("uid", "==", uid).limit(40)
      );
      let dayTotal = 0;
      let hasPending = false;
      todayQ.forEach((doc) => {
        const w = doc.data() as Withdrawal;
        if (
          w.status === "requested" ||
          w.status === "pending_review" ||
          w.status === "approved" ||
          w.status === "processing"
        ) {
          hasPending = true;
        }
        if (w.createdAt >= dayStart && w.status !== "rejected" && w.status !== "payment_failed") {
          dayTotal += w.amount;
        }
      });
      if (hasPending) {
        throw new Error("You already have a pending withdrawal. Wait for it to finish.");
      }
      if (dayTotal + amount > MAX_WITHDRAWAL) {
        throw new Error(
          `Daily limit is ₦${MAX_WITHDRAWAL.toLocaleString("en-NG")}. Already requested ₦${dayTotal.toLocaleString("en-NG")} today.`
        );
      }

      const nextWallet = applyWithdrawalRequest(wallet, amount);
      const now = Date.now();
      tx.update(walletRef, {
        purchased: nextWallet.purchased,
        promo: nextWallet.promo,
        reservedStake: nextWallet.reservedStake,
        reservedWithdrawal: nextWallet.reservedWithdrawal,
        balance: nextWallet.balance,
        updatedAt: now,
      });

      const wRef = adminDb.collection("withdrawals").doc();
      const withdrawal: Withdrawal = {
        id: wRef.id,
        uid,
        amount,
        bankCode,
        accountNumber,
        accountName: lockedAccountName,
        status: "pending_review",
        adminNote: null,
        flwTransferId: null,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(wRef, withdrawal);

      const ledRef = adminDb.collection("ledger").doc();
      tx.set(
        ledRef,
        buildLedgerEntry({
          id: ledRef.id,
          uid,
          type: "WITHDRAWAL_REQUEST",
          amount: -amount,
          balanceBefore: wallet.balance,
          balanceAfter: nextWallet.balance,
          withdrawalId: wRef.id,
          referenceId: wRef.id,
          now,
        })
      );

      const trRef = adminDb.collection("transactions").doc();
      tx.set(trRef, {
        id: trRef.id,
        uid,
        type: "WITHDRAWAL_REQUEST",
        amount: -amount,
        balanceBefore: wallet.balance,
        balanceAfter: nextWallet.balance,
        betId: null,
        status: "pending",
        referenceId: wRef.id,
        createdAt: now,
      });

      return { id: wRef.id, amount, withdrawableAfter: withdrawableBalance(nextWallet) };
    });

    void securityLog({ type: "WITHDRAW_REQUESTED", uid, ip, meta: { amount } });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const status = raw.includes("pending") || raw.includes("limit") || raw.includes("Withdrawable") || raw.includes("Play through")
      ? 400
      : 500;
    return NextResponse.json(
      { error: publicErrorMessage(e, "Withdrawal request failed. Please try again.") },
      { status }
    );
  }
                                      }
