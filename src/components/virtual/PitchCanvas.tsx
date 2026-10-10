"use client";

/**
 * 2D pitch playback (passive): reads the match minute from a ref every frame,
 * samples the precomputed ball track, and smooths everything with linear
 * interpolation. Home = red dots (attack right), away = blue dots.
 */
import { useEffect, useRef } from "react";
import {
  FORMATION_AWAY,
  FORMATION_HOME,
  sampleBall,
  type PitchTick,
} from "@/lib/virtual/pitchSim";

type P = { x: number; y: number };

export default function PitchCanvas({
  ticks,
  minuteRef,
  seed,
}: {
  ticks: PitchTick[];
  /** Current (fractional) match minute, updated by the parent clock. */
  minuteRef: { current: number };
  seed: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ball: P = { x: 50, y: 50 };
    const home: P[] = FORMATION_HOME.map(([x, y]) => ({ x, y }));
    const away: P[] = FORMATION_AWAY.map(([x, y]) => ({ x, y }));
    // Per-player wobble phase so the dots do not move in lockstep.
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
    const phase = Array.from({ length: 22 }, (_, i) => ((s >>> (i % 16)) & 7) + i);

    let raf = 0;
    const LERP = 0.12;

    const draw = (tms: number) => {
      const W = canvas.width;
      const H = canvas.height;
      const px = (v: number) => (v / 100) * W;
      const py = (v: number) => (v / 100) * H;

      const t = sampleBall(ticks, minuteRef.current);
      ball.x += (t.x - ball.x) * LERP;
      ball.y += (t.y - ball.y) * LERP;

      const pull = (base: [number, number], side: "home" | "away", i: number) => {
        const bx = ball.x - 50;
        const by = ball.y - 50;
        // Whole team slides toward the ball; keepers barely move.
        const k = i === 0 ? 0.05 : 0.38;
        const tx = base[0] + bx * k;
        const ty = base[1] + by * (i === 0 ? 0.1 : 0.22);
        const wob = Math.sin(tms / 520 + phase[i + (side === "home" ? 0 : 11)]!) * 1.1;
        return { x: tx + wob, y: ty + Math.cos(tms / 610 + phase[i]!) * 1.1 };
      };

      // Grass with mowing stripes
      ctx.fillStyle = "#2f8f2a";
      ctx.fillRect(0, 0, W, H);
      const stripes = 10;
      for (let i = 0; i < stripes; i += 2) {
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        ctx.fillRect((i * W) / stripes, 0, W / stripes, H);
      }

      // Lines
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(1, W / 360);
      const mx = W * 0.04;
      const my = H * 0.06;
      ctx.strokeRect(mx, my, W - 2 * mx, H - 2 * my);
      ctx.beginPath();
      ctx.moveTo(W / 2, my);
      ctx.lineTo(W / 2, H - my);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, H * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      const boxW = W * 0.13;
      const boxH = H * 0.55;
      ctx.strokeRect(mx, (H - boxH) / 2, boxW, boxH);
      ctx.strokeRect(W - mx - boxW, (H - boxH) / 2, boxW, boxH);
      const sixW = W * 0.05;
      const sixH = H * 0.28;
      ctx.strokeRect(mx, (H - sixH) / 2, sixW, sixH);
      ctx.strokeRect(W - mx - sixW, (H - sixH) / 2, sixW, sixH);
      // Goals
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      const gH = H * 0.13;
      ctx.fillRect(mx - W * 0.025, (H - gH) / 2, W * 0.025, gH);
      ctx.fillRect(W - mx, (H - gH) / 2, W * 0.025, gH);

      // Players
      const dot = Math.max(3, W / 120);
      const drawTeam = (
        team: P[],
        base: Array<[number, number]>,
        side: "home" | "away",
        color: string
      ) => {
        team.forEach((p, i) => {
          const tg = pull(base[i]!, side, i);
          p.x += (tg.x - p.x) * LERP;
          p.y += (tg.y - p.y) * LERP;
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), dot, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      };
      drawTeam(home, FORMATION_HOME, "home", "#e53935");
      drawTeam(away, FORMATION_AWAY, "away", "#1e6bff");

      // Ball
      ctx.beginPath();
      ctx.arc(px(ball.x), py(ball.y), dot * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#111";
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ticks, minuteRef, seed]);

  return <canvas ref={ref} className="block h-full w-full" />;
}
