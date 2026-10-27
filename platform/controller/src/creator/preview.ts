// The live preview: one canvas, <= 30 fps and ONLY while the creator is open. Tap = the character hops and greets, swipe sideways = turn (front, side, back).
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
const WAVE_MS = 700;
const BOX_H = 190; // design units from the feet to the top of the tallest hat

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
    const k = Math.min(canvas.height / (BOX_H + 24), canvas.width / 150);
    const hop = now - waveAt < WAVE_MS ? Math.abs(Math.sin(((now - waveAt) / WAVE_MS) * Math.PI * 3)) * 16 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, canvas.width / 2, canvas.height - 12 * k - hop * k);
    draw(painter, ap, { view: VIEWS[view]!, t: now / 1000, slotColor });
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
