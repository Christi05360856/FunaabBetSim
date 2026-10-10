/**
 * Lightweight Web Audio SFX — no asset files, no network, no Firestore.
 *
 * Mobile browsers keep AudioContext suspended until a user gesture.
 * Call unlockAudio() (or any sfx*) from a click/tap handler first.
 */

let ctx: AudioContext | null = null;
let unlocked = false;
let unlockBound = false;

function getAC(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ||
    null
  );
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = getAC();
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Resume context; returns true when running. */
async function resumeCtx(): Promise<boolean> {
  const c = ensureCtx();
  if (!c) return false;
  try {
    if (c.state === "suspended") {
      await c.resume();
    }
    unlocked = c.state === "running";
    return unlocked;
  } catch {
    return false;
  }
}

/**
 * Call once from any user gesture (tap Join / Start / tile / Place).
 * Safe to call many times.
 */
export function unlockAudio(): void {
  void resumeCtx();
  // Silent buffer trick helps some iOS versions fully unlock output
  try {
    const c = ensureCtx();
    if (!c) return;
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

/** Auto-unlock on first pointer/key anywhere in the document (once). */
export function bindGlobalAudioUnlock(): void {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const once = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("touchstart", once, true);
    window.removeEventListener("keydown", once, true);
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("touchstart", once, true);
  window.addEventListener("keydown", once, true);
}

function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType = "sine",
  gain = 0.12,
  slideTo?: number
) {
  const c = ensureCtx();
  if (!c) return;

  // If still suspended, try resume (works when called from a gesture)
  if (c.state === "suspended") {
    void c.resume().then(() => {
      unlocked = c.state === "running";
      if (unlocked) playTone(c, freq, durationMs, type, gain, slideTo);
    });
    return;
  }
  playTone(c, freq, durationMs, type, gain, slideTo);
}

function playTone(
  c: AudioContext,
  freq: number,
  durationMs: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number
) {
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    const t0 = c.currentTime;
    const dur = Math.max(0.02, durationMs / 1000);
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideTo),
        t0 + dur
      );
    }
    // Avoid 0 gain (exponentialRamp needs > 0)
    g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch {
    /* ignore */
  }
}

function chain(notes: Array<() => void>, gapMs: number) {
  notes.forEach((fn, i) => {
    if (i === 0) fn();
    else setTimeout(fn, gapMs * i);
  });
}

export function sfxClick() {
  unlockAudio();
  tone(660, 45, "square", 0.06);
}

export function sfxBet() {
  unlockAudio();
  chain(
    [
      () => tone(440, 90, "triangle", 0.1),
      () => tone(660, 110, "triangle", 0.09),
    ],
    80
  );
}

export function sfxCashout() {
  unlockAudio();
  chain(
    [
      () => tone(523, 100, "sine", 0.12),
      () => tone(659, 100, "sine", 0.11),
      () => tone(784, 160, "sine", 0.1),
    ],
    90
  );
}

export function sfxCrash() {
  unlockAudio();
  tone(220, 320, "sawtooth", 0.14, 55);
}

export function sfxFlyTick(mult: number) {
  // Don't force unlock on every tick — only play if already running
  const c = ensureCtx();
  if (!c || c.state !== "running") return;
  const f = 280 + Math.min(800, Math.log(Math.max(1, mult)) * 180);
  tone(f, 35, "sine", 0.04);
}

export function sfxDiamond() {
  unlockAudio();
  chain(
    [
      () => tone(880, 80, "sine", 0.1),
      () => tone(1320, 100, "sine", 0.08),
    ],
    55
  );
}

export function sfxBomb() {
  unlockAudio();
  tone(120, 260, "sawtooth", 0.16, 40);
}

export function sfxWheelTick() {
  unlockAudio();
  tone(500 + Math.random() * 200, 40, "square", 0.05);
}

export function sfxGoal() {
  unlockAudio();
  chain(
    [
      () => tone(600, 90, "triangle", 0.11),
      () => tone(900, 130, "triangle", 0.1),
    ],
    75
  );
}

export function sfxWin() {
  unlockAudio();
  chain(
    [
      () => tone(523, 110, "sine", 0.11),
      () => tone(659, 110, "sine", 0.1),
      () => tone(784, 180, "sine", 0.1),
    ],
    110
  );
}

export function sfxLose() {
  unlockAudio();
  tone(300, 180, "triangle", 0.1, 140);
  }
