/**
 * Lightweight Web Audio SFX — no asset files, no network, no Firestore.
 * Safe to call from any client component; silently no-ops if AudioContext blocked.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType = "sine",
  gain = 0.08,
  slideTo?: number
) {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideTo),
        c.currentTime + durationMs / 1000
      );
    }
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + durationMs / 1000);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + durationMs / 1000 + 0.02);
  } catch {
    /* ignore */
  }
}

export function sfxClick() {
  tone(660, 40, "square", 0.04);
}

export function sfxBet() {
  tone(440, 80, "triangle", 0.07);
  setTimeout(() => tone(660, 100, "triangle", 0.06), 70);
}

export function sfxCashout() {
  tone(523, 90, "sine", 0.09);
  setTimeout(() => tone(659, 90, "sine", 0.08), 80);
  setTimeout(() => tone(784, 140, "sine", 0.07), 160);
}

export function sfxCrash() {
  tone(220, 280, "sawtooth", 0.1, 60);
}

export function sfxFlyTick(mult: number) {
  // Soft rising blip; call sparsely from UI
  const f = 280 + Math.min(800, Math.log(Math.max(1, mult)) * 180);
  tone(f, 30, "sine", 0.025);
}

export function sfxDiamond() {
  tone(880, 70, "sine", 0.07);
  setTimeout(() => tone(1320, 90, "sine", 0.05), 50);
}

export function sfxBomb() {
  tone(120, 220, "sawtooth", 0.12, 40);
}

export function sfxWheelTick() {
  tone(500 + Math.random() * 200, 35, "square", 0.035);
}

export function sfxGoal() {
  tone(600, 80, "triangle", 0.08);
  setTimeout(() => tone(900, 120, "triangle", 0.07), 70);
}

export function sfxWin() {
  tone(523, 100, "sine", 0.08);
  setTimeout(() => tone(659, 100, "sine", 0.07), 100);
  setTimeout(() => tone(784, 160, "sine", 0.07), 200);
}

export function sfxLose() {
  tone(300, 150, "triangle", 0.07, 150);
}
