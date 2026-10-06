/**
 * Share card — F-Betsim brand style (timeline + stake/odds footer).
 * Export name kept as shareOfficialTicket for bets/page.tsx import.
 */
import type { Bet, BetLeg, Match, Team } from "@/types/domain";
import {
  formatMoneyFull,
  resolveSelection,
} from "@/lib/domain/selectionLabel";

function betLegs(bet: Bet): BetLeg[] {
  if (bet.legs && bet.legs.length > 0) return bet.legs;
  return [
    {
      matchId: bet.matchId,
      marketId: bet.marketId,
      selectionId: bet.selectionId,
      selectionLabel: bet.selectionLabel || "",
      odds:
        bet.oddsAtPlacement ||
        (bet.stake > 0 ? bet.potentialPayout / bet.stake : 1),
    },
  ];
}

function settledReturn(bet: Bet): number {
  if (bet.status === "won") {
    const p = Number(bet.payout);
    if (Number.isFinite(p) && p > 0) return p;
  }
  if (bet.status === "void") return bet.stake;
  if (bet.status === "lost") return 0;
  return bet.potentialPayout;
}

function displayOdds(bet: Bet): number {
  const legs = betLegs(bet);
  if (bet.status === "won") {
    const p = Number(bet.payout);
    if (Number.isFinite(p) && p > 0 && bet.stake > 0) {
      return Math.round((p / bet.stake) * 100) / 100;
    }
    const active = legs.filter((l) => l.status !== "void");
    if (active.length) {
      return (
        Math.round(
          active.reduce((a, l) => a * (Number(l.odds) || 1), 1) * 100
        ) / 100
      );
    }
  }
  return (
    Math.round(legs.reduce((a, l) => a * (Number(l.odds) || 1), 1) * 100) /
      100 || 1
  );
}

function ticketCode(bet: Bet): string {
  const anyBet = bet as Bet & { ticketCode?: string };
  return (anyBet.ticketCode || bet.id).slice(0, 14).toUpperCase();
}

function legSubtext(leg: BetLeg, match: Match | undefined): string {
  const st = leg.status || "pending";
  if (st === "won" || st === "lost") {
    if (match?.homeScore != null && match?.awayScore != null) {
      return "FT " + match.homeScore + "-" + match.awayScore;
    }
    if (match?.currentHomeScore != null && match?.currentAwayScore != null) {
      return match.currentHomeScore + "-" + match.currentAwayScore;
    }
    return st === "won" ? "Won" : "Lost";
  }
  if (st === "void") return "Void";
  if (!match) return "";
  const ko = Number(match.kickoffAt) || 0;
  if (
    match.status === "live" ||
    match.status === "halftime" ||
    match.status === "second_half"
  ) {
    const hs = match.currentHomeScore;
    const as = match.currentAwayScore;
    if (hs != null && as != null) return "Live " + hs + "-" + as;
    return "Live";
  }
  if (ko > Date.now()) {
    return new Date(ko).toLocaleString("en-NG", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return "";
}

export async function shareOfficialTicket(
  bet: Bet,
  matches: Record<string, Match>,
  teams: Record<string, Team>
): Promise<void> {
  const legs = betLegs(bet);
  const odds = displayOdds(bet);
  const ret = settledReturn(bet);
  const code = ticketCode(bet);
  const isWon = bet.status === "won";
  const isLost = bet.status === "lost";

  // Layout constants (high-res for sharp WhatsApp share)
  const scale = 2;
  const w = 390 * scale;
  const pad = 20 * scale;
  const rowH = 72 * scale;
  const headerH = 72 * scale;
  const footerH = 148 * scale;
  const h = headerH + legs.length * rowH + footerH + pad;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  const W = w / scale;
  const H = h / scale;
  const P = pad / scale;
  const RH = rowH / scale;
  const HH = headerH / scale;
  const FH = footerH / scale;

  // Outer light frame
  ctx.fillStyle = "#e8eef5";
  ctx.fillRect(0, 0, W, H);

  // Main card
  const cx = 12;
  const cy = 12;
  const cw = W - 24;
  const ch = H - 24;
  ctx.fillStyle = "#0f172a";
  roundRect(ctx, cx, cy, cw, ch, 20);
  ctx.fill();

  // Header: brand + legs count
  ctx.textAlign = "left";
  ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
  // green F mark
  ctx.fillStyle = "#22c55e";
  ctx.fillText("F", cx + 18, cy + 32);
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("-Betsim", cx + 30, cy + 32);

  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(legs.length + " legs", cx + cw - 18, cy + 32);

  // Slip code under brand
  ctx.textAlign = "left";
  ctx.fillStyle = "#64748b";
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(code, cx + 18, cy + 52);

  // Timeline
  const lineX = cx + 28;
  const cardLeft = cx + 48;
  const cardRight = cx + cw - 18;
  const cardW = cardRight - cardLeft;
  let y = cy + HH;

  // vertical line
  if (legs.length > 1) {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, y + RH * 0.35);
    ctx.lineTo(lineX, y + (legs.length - 1) * RH + RH * 0.35);
    ctx.stroke();
  }

  legs.forEach((leg, i) => {
    const m = matches[leg.matchId];
    const home = m ? teams[m.homeTeamId]?.name ?? "Home" : "Home";
    const away = m ? teams[m.awayTeamId]?.name ?? "Away" : "Away";
    const { pick } = resolveSelection(
      leg.selectionId,
      leg.selectionLabel,
      (leg as { marketType?: string }).marketType
    );
    const st = (leg.status || "pending").toLowerCase();
    const sub = legSubtext(leg, m);
    const legOdds = Number(leg.odds || 0).toFixed(2);

    let node = "#f59e0b";
    let badgeBg = "#78350f";
    let badgeFg = "#fbbf24";
    let badge = "Pending";
    if (st === "won") {
      node = "#22c55e";
      badgeBg = "#14532d";
      badgeFg = "#4ade80";
      badge = "Won";
    } else if (st === "lost") {
      node = "#ef4444";
      badgeBg = "#7f1d1d";
      badgeFg = "#fca5a5";
      badge = "Lost";
    } else if (st === "void") {
      node = "#94a3b8";
      badgeBg = "#334155";
      badgeFg = "#cbd5e1";
      badge = "Void";
    }

    // node
    ctx.fillStyle = node;
    ctx.beginPath();
    ctx.arc(lineX, y + RH * 0.35, 6, 0, Math.PI * 2);
    ctx.fill();

    // leg card
    ctx.fillStyle = "#1e293b";
    roundRect(ctx, cardLeft, y + 4, cardW, RH - 10, 12);
    ctx.fill();

    // Leg n + badge
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("Leg " + (i + 1), cardLeft + 12, y + 20);

    ctx.font = "bold 10px system-ui, sans-serif";
    const bw = ctx.measureText(badge).width + 16;
    const bx = cardLeft + cardW - 12 - bw;
    ctx.fillStyle = badgeBg;
    roundRect(ctx, bx, y + 8, bw, 18, 9);
    ctx.fill();
    ctx.fillStyle = badgeFg;
    ctx.fillText(badge, bx + 8, y + 20);

    // teams
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 14px system-ui, sans-serif";
    const title = truncate(ctx, home + " vs " + away, cardW - 70);
    ctx.fillText(title, cardLeft + 12, y + 40);

    // pick + sub left, odds right
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    const pickLine = pick + (sub ? "  ·  " + sub : "");
    ctx.fillText(truncate(ctx, pickLine, cardW - 70), cardLeft + 12, y + 58);

    ctx.textAlign = "right";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(legOdds, cardLeft + cardW - 12, y + 48);

    y += RH;
  });

  // Footer boxes: stake | total odds
  const boxY = y + 8;
  const boxH = 52;
  const gap = 10;
  const boxW = (cardW - gap) / 2;
  const boxX0 = cardLeft;

  ctx.fillStyle = "#1e293b";
  roundRect(ctx, boxX0, boxY, boxW, boxH, 12);
  ctx.fill();
  roundRect(ctx, boxX0 + boxW + gap, boxY, boxW, boxH, 12);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#64748b";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("Stake", boxX0 + 12, boxY + 18);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText(formatMoneyFull(bet.stake), boxX0 + 12, boxY + 38);

  ctx.fillStyle = "#64748b";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("Total odds", boxX0 + boxW + gap + 12, boxY + 18);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText(odds.toFixed(2), boxX0 + boxW + gap + 12, boxY + 38);

  // Potential / return bar
  const barY = boxY + boxH + 12;
  const barH = 48;
  let barBg = "#14532d";
  let barLabel = "Potential win";
  let barVal = formatMoneyFull(ret);
  if (isWon) {
    barBg = "#14532d";
    barLabel = "Return";
  } else if (isLost) {
    barBg = "#7f1d1d";
    barLabel = "Lost";
    barVal = formatMoneyFull(0);
  } else if (bet.status === "void") {
    barBg = "#334155";
    barLabel = "Refund";
  }

  ctx.fillStyle = barBg;
  roundRect(ctx, cardLeft, barY, cardW, barH, 12);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#86efac";
  if (isLost) ctx.fillStyle = "#fca5a5";
  if (bet.status === "void") ctx.fillStyle = "#cbd5e1";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(barLabel, cardLeft + 16, barY + 30);

  ctx.textAlign = "right";
  ctx.fillStyle = "#f0fdf4";
  if (isLost) ctx.fillStyle = "#fecaca";
  if (bet.status === "void") ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText(barVal, cardLeft + cardW - 16, barY + 30);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return;

  const file = new File([blob], code + ".png", { type: "image/png" });
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };

  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title: "F-Betsim " + code,
        text: "F-Betsim ticket " + code,
      });
      return;
    }
  } catch {
    /* cancelled */
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = code + ".png";
  a.click();
  URL.revokeObjectURL(url);
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + "…").width > maxW) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
