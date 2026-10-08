"use client";
import { useEffect, useRef } from "react";

type Props = {
  rows: number;
  slots: number[];
  result: { id: number; path: number[] } | null;
  onDone?: () => void;
};

const W = 360, H = 400, TOP = 24, BOT = 40;

export default function PlinkoBoard({ rows, slots, result, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ball = useRef<{ x: number; y: number } | null>(null);
  const hit = useRef(-1);

  const gap = (W - 24) / (rows + 2);
  const rowH = (H - TOP - BOT - 30) / rows;
  const px = (r: number, off: number) => W / 2 + off * gap;
  const py = (r: number) => TOP + r * rowH;

  function draw() {
    const c = ref.current!.getContext("2d")!;
    c.clearRect(0, 0, W, H);
    c.fillStyle = "#0f212e";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#fff";
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < r + 3; i++) {
        c.beginPath();
        c.arc(px(r, i - (r + 2) / 2), py(r), 2.2, 0, 7);
        c.fill();
      }
    const sy = py(rows) + 8, sw = gap - 2;
    slots.forEach((m, k) => {
      const t = Math.abs(k - rows / 2) / (rows / 2);
      c.fillStyle = `hsl(${50 - t * 50}, 90%, ${hit.current === k ? 75 : 55}%)`;
      const x = px(0, k - rows / 2) - sw / 2;
      c.beginPath();
      c.roundRect(x, sy + (hit.current === k ? 4 : 0), sw, 22, 3);
      c.fill();
      c.fillStyle = "#0f212e";
      c.font = "bold 7px sans-serif";
      c.textAlign = "center";
      c.fillText(m + "x", x + sw / 2, sy + 14 + (hit.current === k ? 4 : 0));
    });
    if (ball.current) {
      c.fillStyle = "#ffb020";
      c.beginPath();
      c.arc(ball.current.x, ball.current.y, 5, 0, 7);
      c.fill();
    }
  }

  useEffect(draw, [rows, slots]);

  useEffect(() => {
    if (!result) return;
    hit.current = -1;
    let k = 0;
    const pts = [{ x: px(0, 0), y: py(0) - 14 }];
    for (let r = 0; r <= rows; r++) {
      pts.push({ x: px(r, k - r / 2), y: r === rows ? py(rows) + 4 : py(r) - 7 });
      if (r < rows) k += result.path[r];
    }
    const SEG = 110;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - t0) / SEG;
      const i = Math.min(Math.floor(t), pts.length - 2);
      const f = Math.min(t - i, 1);
      const a = pts[i], b = pts[i + 1];
      ball.current = {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * 5,
      };
      draw();
      if (t < pts.length - 1) raf = requestAnimationFrame(tick);
      else {
        hit.current = k;
        ball.current = null;
        draw();
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result?.id]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ width: "100%", borderRadius: 16, display: "block" }}
    />
  );
}
