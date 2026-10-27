// The live preview: one canvas, <= 30 fps and ONLY while the creator is open. Tap = the character greets (sways, hops and says "¡Hola!"), swipe sideways = turn (front, side, back).
import { Canvas2DPainter, type Appearance, type Painter } from '@pichi/core';

export type View = 'front' | 'side' | 'back';
export const VIEWS: readonly View[] = ['front', 'side', 'back'];
export interface DrawOpts {
  view: View;
  t: number;
  slotColor: string;
  role?: string;
}
/** The signature F2 exports from core/avatar/draw.ts. */
export type DrawAvatar = (p: Painter, ap: Appearance, opts: DrawOpts) => void;

export const FRAME_MS = 1000 / 30;
const SWIPE_PX = 24;
const WAVE_MS = 1100;
const BOX_H = 165; // design units shown: from 145 above the feet (tallest hat + the hop) to 20 below (shadow)
const BOX_W = 125;
const MID = 62.5; // the box centre, above the feet

export interface Preview {
  start(): void;
  stop(): void;
  frame(): void; // one frame now (tests, and the first paint after a resize)
  readonly view: View;
  readonly running: boolean;
}

export function createPreview(canvas: HTMLCanvasElement, draw: DrawAvatar, get: () => { ap: Appearance; slotColor: string }): Preview {
  const ctx = canvas.getContext('2d')!;
  const painter = new Canvas2DPainter(ctx);
  let timer: ReturnType<typeof setInterval> | null = null;
  let view = 0;
  let waveAt = -1e9;
  let down: { x: number; t: number; moved: boolean } | null = null;

  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const frame = () => {
    fit();
    const now = performance.now();
    const { ap, slotColor } = get();
    const k = Math.min(canvas.height / BOX_H, canvas.width / BOX_W);
    const ph = Math.min(1, (now - waveAt) / WAVE_MS); // greeting progress, 1 = idle
    const sway = ph < 1 ? Math.sin(ph * Math.PI * 5) * 0.14 * (1 - ph) : 0; // rad, around the feet
    const hop = ph < 1 ? Math.abs(Math.sin(ph * Math.PI * 2.5)) * 8 * (1 - ph) : 0;
    const feetY = canvas.height / 2 + MID * k - hop * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k * Math.cos(sway), k * Math.sin(sway), -k * Math.sin(sway), k * Math.cos(sway), canvas.width / 2, feetY);
    draw(painter, ap, { view: VIEWS[view]!, t: now / 1000, slotColor });
    if (ph < 1) bubble(canvas.width / 2 + 38 * k, feetY - 118 * k, k, Math.min(1, ph * 8, (1 - ph) * 6));
  };
  const bubble = (x: number, y: number, k: number, a: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a;
    ctx.font = `800 ${Math.round(15 * k)}px system-ui, sans-serif`;
    const w = ctx.measureText('¡Hola!').width + 16 * k;
    const bx = Math.min(x, canvas.width - w - 6 * k);
    ctx.fillStyle = '#FFF4E0';
    ctx.strokeStyle = '#2B1B17';
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.roundRect(bx, y - 12 * k, w, 26 * k, 10 * k);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2B1B17';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡Hola!', bx + 8 * k, y + k);
    ctx.globalAlpha = 1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, t: performance.now(), moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || down.moved || Math.abs(e.clientX - down.x) < SWIPE_PX) return;
    down.moved = true;
    view = (view + (e.clientX > down.x ? 1 : VIEWS.length - 1)) % VIEWS.length;
    frame();
  });
  const up = () => {
    if (down && !down.moved) waveAt = performance.now();
    down = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });

  return {
    start() {
      if (timer === null) timer = setInterval(frame, FRAME_MS);
      frame();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    frame,
    get view() {
      return VIEWS[view]!;
    },
    get running() {
      return timer !== null;
    },
  };
}
