/**
 * Human-readable selection text for tickets / My Bets.
 * Prefers selectionId when the stored label is too short (e.g. "Yes", "Over").
 */
export function formatSelectionLabel(
  selectionId: string | undefined,
  selectionLabel?: string | null
): string {
  const id = (selectionId ?? "").toLowerCase().trim();
  const label = (selectionLabel ?? "").trim();

  if (id === "home" || id === "1") return "1X2 · Home";
  if (id === "draw" || id === "x") return "1X2 · Draw";
  if (id === "away" || id === "2") return "1X2 · Away";

  if (id === "home_draw" || id === "1x") return "Double chance · 1X";
  if (id === "home_away" || id === "12") return "Double chance · 12";
  if (id === "draw_away" || id === "x2") return "Double chance · X2";

  if (id === "yes" || id === "btts_yes") return "BTTS · Yes";
  if (id === "no" || id === "btts_no") return "BTTS · No";

  const ou = /^(over|under)_(\d+(?:\.\d+)?)$/.exec(id);
  if (ou) {
    const side = ou[1] === "over" ? "Over" : "Under";
    return side + " " + ou[2];
  }
  if (id === "over" || id === "under") {
    if (label && /over|under/i.test(label)) return label;
    return id === "over" ? "Over" : "Under";
  }

  if (id === "dnb_home") return "DNB · Home";
  if (id === "dnb_away") return "DNB · Away";

  if (/^\d+-\d+$/.test(id)) return "Correct score · " + id;

  if (label.length >= 3 && label.toLowerCase() !== "yes" && label.toLowerCase() !== "no") {
    return label;
  }
  if (label) return label;
  return selectionId || "Selection";
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
