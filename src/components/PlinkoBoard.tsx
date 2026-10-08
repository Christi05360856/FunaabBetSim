"use client";

import { useEffect, useRef } from "react";

type Props = {
  rows: number;
  slots: readonly number[];
  result: { id: number; path: number[] } | null;
  onDone?: () => void;
};

type Pt = { x: number; y: number };

const W = 360;
const H = 400;
const TOP = 24;
const BOT = 40;
const SEG = 260; // ms per peg bounce (higher = slower)

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export default function PlinkoBoard({ rows, slots, result, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ball = useRef<Pt | null>(null);
  const hit = useRef(-1);
  const doneRef = useRef<(() => void) | undefined>(onDone);
  doneRef.current = onDone;

  const gap = (W - 24) / (rows + 2);
  const rowH = (H - TOP - BOT - 30) / rows;
  const px = (off: number) => W / 2 + off * gap;
  const py = (r: number) => TOP + r * rowH;

  function draw() {
    const cv = ref.current;
    if (!cv) return;
    const c = cv.getContext("2d");
    if (!c) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    c.clearRect(0, 0, W, H);
    c.fillStyle = "#0f212e";
    c.fillRect(0, 0, W, H);

    // pegs (pyramid)
    c.fillStyle = "#ffffff";
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < r + 3; i++) {
        c.beginPath();
        c.arc(px(i - (r + 2) / 2), py(r), 2.2, 0, Math.PI * 2);
        c.fill();
      }
    }

    // slots
    const sy = py(rows) + 8;
    const sw = gap - 2;
    slots.forEach((m, k) => {
      const t = Math.abs(k - rows / 2) / (rows / 2);
      const active = hit.current === k;
      c.fillStyle = `hsl(${50 - t * 50}, 90%, ${active ? 72 : 55}%)`;
      const x = px(k - rows / 2) - sw / 2;
      const y = sy + (active ? 4 : 0);
      roundRect(c, x, y, sw, 22, 3);
      c.fill();
      c.fillStyle = "#0f212e";
      c.font = "bold 7px sans-serif";
      c.textAlign = "center";
      c.fillText(`${m}x`, x + sw / 2, y + 14);
    });

    // ball
    const b = ball.current;
    if (b) {
      c.fillStyle = "#ffb020";
      c.beginPath();
      c.arc(b.x, b.y, 5, 0, Math.PI * 2);
      c.fill();
    }
  }

  // initial / prop-change draw
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, slots]);

  // animate each new result
  useEffect(() => {
    if (!result) return;
    const path = result.path;

    hit.current = -1;
    let k = 0;
    const pts: Pt[] = [{ x: px(0), y: py(0) - 14 }];
    for (let r = 0; r <= rows; r++) {
      pts.push({
        x: px(k - r / 2),
        y: r === rows ? py(rows) + 4 : py(r) - 7,
      });
      if (r < rows) k += path[r] === 1 ? 1 : 0;
    }
    const finalSlot = k;

    const t0 = performance.now();
    let raf = 0;
    const last = pts.length - 1;

    const tick = (now: number) => {
      const t = (now - t0) / SEG;
      const i = Math.max(0, Math.min(Math.floor(t), last - 1));
      const f = Math.max(0, Math.min(t - i, 1));
      const a = pts[i];
      const b = pts[i + 1];
      if (a && b) {
        ball.current = {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f - 4 * (rowH * 0.55) * f * (1 - f),
        };
      }
      draw();
      if (t < last) {
        raf = requestAnimationFrame(tick);
      } else {
        hit.current = finalSlot;
        ball.current = null;
        draw();
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{
        width: "100%",
        aspectRatio: `${W} / ${H}`,
        borderRadius: 16,
        display: "block",
      }}
    />
  );
        }
