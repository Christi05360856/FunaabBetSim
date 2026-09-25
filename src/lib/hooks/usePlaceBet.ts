"use client";

/**
 * Shared bet-placement state + submit logic — used by both the Fixtures
 * list (inline quick-bet) and the match detail page, so there's exactly one
 * place that calls POST /api/bets. Keep this a pure state/behavior hook;
 * BetPanel.tsx owns the actual markup.
 */
import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Selection } from "@/types/domain";

export type PickedSelection = { matchId: string; marketId: string; selection: Selection };

export function usePlaceBet() {
  const { user } = useAuth();
  const [picked, setPicked] = useState<PickedSelection | null>(null);
  const [stake, setStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function pick(matchId: string, marketId: string, selection: Selection) {
    setFeedback(null);
    setPicked((prev) =>
      prev?.selection.id === selection.id && prev.matchId === matchId ? null : { matchId, marketId, selection }
    );
    setStake("");
  }

  function clearPick() {
    setPicked(null);
    setStake("");
  }

  async function confirmBet() {
    if (!picked || !user) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: picked.matchId,
          marketId: picked.marketId,
          selectionId: picked.selection.id,
          stake: Number(stake),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not place bet");
      setFeedback(`Bet placed! Potential payout: ₦${body.potentialPayout.toLocaleString("en-NG")}`);
      setPicked(null);
      setStake("");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return { user, picked, stake, setStake, submitting, feedback, pick, clearPick, confirmBet };
}
