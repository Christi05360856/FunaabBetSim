/**
 * Human-readable market / pick / outcome for tickets.
 */

export function formatSelectionLabel(
  selectionId: string | undefined,
  selectionLabel?: string | null
): string {
  const { market, pick } = resolveSelection(selectionId, selectionLabel);
  return market + " · " + pick;
}

export function resolveSelection(
  selectionId: string | undefined,
  selectionLabel?: string | null
): { market: string; pick: string } {
  const id = (selectionId ?? "").toLowerCase().trim();
  const label = (selectionLabel ?? "").trim();

  if (id === "home" || id === "1") return { market: "1X2", pick: "Home" };
  if (id === "draw" || id === "x") return { market: "1X2", pick: "Draw" };
  if (id === "away" || id === "2") return { market: "1X2", pick: "Away" };

  if (id === "home_draw" || id === "1x")
    return { market: "Double chance", pick: "1X" };
  if (id === "home_away" || id === "12")
    return { market: "Double chance", pick: "12" };
  if (id === "draw_away" || id === "x2")
    return { market: "Double chance", pick: "X2" };

  if (id === "yes" || id === "btts_yes")
    return { market: "Both teams to score", pick: "Yes" };
  if (id === "no" || id === "btts_no")
    return { market: "Both teams to score", pick: "No" };

  const ou = /^(over|under)_(\d+(?:\.\d+)?)$/.exec(id);
  if (ou) {
    return {
      market: "Over/Under " + ou[2],
      pick: (ou[1] === "over" ? "Over" : "Under") + " " + ou[2],
    };
  }
  if (id === "over" || id === "under") {
    const pick =
      label && /over|under/i.test(label)
        ? label
        : id === "over"
          ? "Over"
          : "Under";
    return { market: "Over/Under", pick };
  }

  if (id === "dnb_home") return { market: "Draw no bet", pick: "Home" };
  if (id === "dnb_away") return { market: "Draw no bet", pick: "Away" };

  if (/^\d+-\d+$/.test(id))
    return { market: "Correct score", pick: id.replace("-", "–") };

  if (label.toLowerCase().startsWith("over"))
    return { market: "Over/Under", pick: label };
  if (label.toLowerCase().startsWith("under"))
    return { market: "Over/Under", pick: label };

  if (label.length >= 2) return { market: "Market", pick: label };
  return { market: "Market", pick: selectionId || "—" };
}

export function outcomeLabel(
  status: string,
  pick: string
): string {
  if (status === "won") return pick;
  if (status === "lost") return "Lost";
  if (status === "void") return "Void";
  return "Pending";
}

export function matchFinalScore(match: {
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  currentHomeScore?: number | null;
  currentAwayScore?: number | null;
} | undefined): { text: string; live: boolean } | null {
  if (!match) return null;
  if (
    match.status === "settled" &&
    match.homeScore != null &&
    match.awayScore != null
  ) {
    return { text: match.homeScore + " – " + match.awayScore, live: false };
  }
  if (match.currentHomeScore != null && match.currentAwayScore != null) {
    return {
      text: match.currentHomeScore + " – " + match.currentAwayScore,
      live: true,
    };
  }
  return null;
}

/** Compact money for UI — avoids horizontal overflow on huge balances. */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "₦0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) {
    return sign + "₦" + (abs / 1_000_000_000_000).toFixed(2).replace(/\.?0+$/, "") + "T";
  }
  if (abs >= 1_000_000_000) {
    return sign + "₦" + (abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + "B";
  }
  if (abs >= 1_000_000) {
    return sign + "₦" + (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  }
  return sign + "₦" + Math.round(abs).toLocaleString("en-NG");
}

export function formatMoneyFull(n: number): string {
  if (!Number.isFinite(n)) return "₦0";
  return "₦" + Math.round(n).toLocaleString("en-NG");
}
