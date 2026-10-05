/**
 * "The Journey" share card — timeline style for open / settled tickets.
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

function ticketCode(bet: Bet): string {
  const anyBet = bet as Bet & { ticketCode?: string };
  return (anyBet.ticketCode || bet.id).slice(0, 12).toUpperCase();
}

function legSubtext(
  leg: BetLeg,
  match: Match | undefined
): string {
  const st = leg.status || "pending";
  if (st === "won" || st === "lost") {
    if (match?.homeScore != null && match?.awayScore != null) {
      return "Full time: " + match.homeScore + "-" + match.awayScore;
    }
    if (match?.currentHomeScore != null && match?.currentAwayScore != null) {
      return "Score: " + match.currentHomeScore + "-" + match.currentAwayScore;
    }
    return st === "won" ? "Won" : "Lost";
  }
  if (st === "void") return "Void — removed from odds";
  if (!match) return "Awaiting kickoff…";
  const now = Date.now();
  const ko = Number(match.kickoffAt) || 0;
  if (
    match.status === "live" ||
    match.status === "halftime" ||
    match.status === "second_half"
  ) {
    const hs = match.currentHomeScore;
    const as = match.currentAwayScore;
    if (hs != null && as != null) return "Live " + hs + "-" + as;
    return "In play";
  }
  if (ko > now) {
    return new Date(ko).toLocaleString("en-NG", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return "Awaiting kickoff…";
}

export async function shareOfficialTicket(
  bet: Bet,
  matches: Record<string, Match>,
  teams: Record<string, Team>
): Promise<void> {
  const legs = betLegs(bet);
  const ret = settledReturn(bet);
  const code = ticketCode(bet);
  const decided = legs.filter(
    (l) => l.status === "won" || l.status === "lost" || l.status === "void"
  ).length;
  const wonCount = legs.filter((l) => l.status === "won").length;
  const pct =
    legs.length > 0 ? Math.round((decided / legs.length) * 100) : 0;

  const w = 720;
  const pad = 40;
  const cardH = 112;
  const topH = 100;
  const bottomH = 120;
  const h = topH + legs.length * (cardH + 16) + bottomH + 40;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Dark background
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.textAlign = "left";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 28px system-ui, -apple-system, sans-serif";
  ctx.fillText("THE JOURNEY", pad, 48);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(
    "Slip " + code + "  ·  " + legs.length + " Legs",
    pad,
    74
  );

  const lineX = pad + 14;
  const cardX = pad + 44;
  const cardW = w - cardX - pad;

  // Vertical timeline line
  const lineTop = topH + 20;
  const lineBot = topH + legs.length * (cardH + 16) - 20;
  ctx.strokeStyle = "#1e3a5f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lineX, lineTop);
  ctx.lineTo(lineX, lineBot);
  ctx.stroke();

  let y = topH;
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

    // Node colour
    let node = "#fbbf24"; // pending
    let badgeBg = "#fbbf24";
    let badgeFg = "#0b1220";
    let badge = "PENDING";
    if (st === "won") {
      node = "#22c55e";
      badgeBg = "#22c55e";
      badgeFg = "#052e16";
      badge = "WON";
    } else if (st === "lost") {
      node = "#f87171";
      badgeBg = "#f87171";
      badgeFg = "#450a0a";
      badge = "LOST";
    } else if (st === "void") {
      node = "#94a3b8";
      badgeBg = "#64748b";
      badgeFg = "#0f172a";
      badge = "VOID";
    }

    // Timeline dot
    ctx.fillStyle = node;
    ctx.beginPath();
    ctx.arc(lineX, y + cardH / 2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0b1220";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Card
    ctx.fillStyle = "#151d2e";
    roundRect(ctx, cardX, y, cardW, cardH, 14);
    ctx.fill();

    // LEG n
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("LEG " + (i + 1), cardX + 16, y + 24);

    // Badge
    ctx.font = "bold 11px system-ui, sans-serif";
    const bw = ctx.measureText(badge).width + 20;
    const bx = cardX + cardW - 16 - bw;
    ctx.fillStyle = badgeBg;
    roundRect(ctx, bx, y + 12, bw, 22, 11);
    ctx.fill();
    ctx.fillStyle = badgeFg;
    ctx.fillText(badge, bx + 10, y + 27);

    // Teams
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 16px system-ui, sans-serif";
    const title = home + " vs " + away;
    ctx.fillText(truncate(ctx, title, cardW - 32), cardX + 16, y + 52);

    // Pick @ odds
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(
      pick + " @ " + Number(leg.odds || 0).toFixed(2),
      cardX + 16,
      y + 74
    );

    // Subtext
    ctx.fillStyle = "#64748b";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(sub, cardX + 16, y + 96);

    y += cardH + 16;
  });

  // Bottom progress panel
  const panelY = y + 8;
  const panelH = 100;
  ctx.fillStyle = "#121a2b";
  roundRect(ctx, pad, panelY, w - pad * 2, panelH, 14);
  ctx.fill();

  ctx.fillStyle = "#64748b";
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("JOURNEY PROGRESS", pad + 20, panelY + 24);

  // Progress track
  const trackX = pad + 20;
  const trackY = panelY + 38;
  const trackW = w - pad * 2 - 40;
  ctx.fillStyle = "#1e293b";
  roundRect(ctx, trackX, trackY, trackW, 8, 4);
  ctx.fill();
  ctx.fillStyle = "#22c55e";
  const fillW = Math.max(8, (trackW * pct) / 100);
  roundRect(ctx, trackX, trackY, fillW, 8, 4);
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(
    decided +
      " of " +
      legs.length +
      " complete  ·  " +
      pct +
      "% there",
    pad + 20,
    panelY + 66
  );

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("AT STAKE", w - pad - 20, panelY + 24);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText(formatMoneyFull(bet.stake), w - pad - 20, panelY + 44);

  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(
    bet.status === "won" ? "RETURN" : "TO WIN",
    w - pad - 20,
    panelY + 66
  );
  ctx.fillStyle = bet.status === "lost" ? "#94a3b8" : "#4ade80";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText(formatMoneyFull(ret), w - pad - 20, panelY + 86);

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#475569";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(
    "FUNAAB BetSim  ·  Play responsibly 18+",
    w / 2,
    h - 16
  );

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return;

  const file = new File([blob], code + "-journey.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };

  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title: "Bet " + code,
        text: "My FUNAAB BetSim journey · " + code,
      });
      return;
    }
  } catch {
    /* cancelled */
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = code + "-journey.png";
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
