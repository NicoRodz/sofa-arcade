import type { PaintGradient, PaintStyle, Painter } from './painter';

/** Structural slice of Phaser.GameObjects.Graphics (no Phaser import: core stays pure). */
export interface GraphicsLike {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
}

type Pt = readonly [number, number];
type Mat = readonly [number, number, number, number, number, number]; // a b c d e f, as in Canvas 2D

class Gradient implements PaintGradient {
  readonly stops: { at: number; color: string }[] = [];
  addColorStop(offset: number, color: string) {
    this.stops.push({ at: offset, color });
  }
}

/** '#rgb', '#rrggbb', 'rgb(r,g,b)' and 'rgba(r,g,b,a)' to a Phaser colour number plus alpha. Unknown strings fall back to black. */
export function parseColor(css: string): { rgb: number; a: number } {
  const m = css.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return { rgb: (Math.round(+m[1]!) << 16) | (Math.round(+m[2]!) << 8) | Math.round(+m[3]!), a: m[4] === undefined ? 1 : +m[4] };
  const h = css.startsWith('#') ? css.slice(1) : '';
  if (h.length === 3) return { rgb: parseInt(h.replace(/./g, '$&$&'), 16), a: 1 };
  if (h.length === 6) return { rgb: parseInt(h, 16), a: 1 };
  return { rgb: 0, a: 1 };
}

/** Phaser gradients are not available on Graphics: use the middle stop (the average look of the shade). */
const solid = (s: PaintStyle): string =>
  typeof s === 'string' ? s : ((s as Gradient).stops[Math.floor(((s as Gradient).stops.length - 1) / 2)]?.color ?? '#000000');

const KAPPA_STEPS = 12;

/**
 * Approximation on Phaser.Graphics: curves are flattened to polylines, the transform stack is applied here, gradients
 * become one colour and clip() is a no-op. Every sub-path is filled on its own (no holes). Good for flat pieces
 * (hair, hats, glasses); the chef textures keep using the Canvas adapter.
 */
export class PhaserGraphicsPainter implements Painter {
  fillStyle: PaintStyle = '#000000';
  strokeStyle: PaintStyle = '#000000';
  lineWidth = 1;
  globalAlpha = 1;
  lineCap: 'butt' | 'round' | 'square' = 'butt';
  lineJoin: 'bevel' | 'round' | 'miter' = 'miter';
  private m: Mat = [1, 0, 0, 1, 0, 0];
  private stack: { m: Mat; fs: PaintStyle; ss: PaintStyle; lw: number; ga: number }[] = [];
  private subs: { pts: Pt[]; closed: boolean }[] = [];
  private cur: Pt = [0, 0];

  constructor(private g: GraphicsLike) {}

  save() {
    this.stack.push({ m: this.m, fs: this.fillStyle, ss: this.strokeStyle, lw: this.lineWidth, ga: this.globalAlpha });
  }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.m = s.m;
    this.fillStyle = s.fs;
    this.strokeStyle = s.ss;
    this.lineWidth = s.lw;
    this.globalAlpha = s.ga;
  }
  private mul(n: Mat) {
    const [a, b, c, d, e, f] = this.m;
    this.m = [
      a * n[0] + c * n[1],
      b * n[0] + d * n[1],
      a * n[2] + c * n[3],
      b * n[2] + d * n[3],
      a * n[4] + c * n[5] + e,
      b * n[4] + d * n[5] + f,
    ];
  }
  translate(x: number, y: number) {
    this.mul([1, 0, 0, 1, x, y]);
  }
  rotate(r: number) {
    this.mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
  }
  scale(x: number, y: number) {
    this.mul([x, 0, 0, y, 0, 0]);
  }
  private tp(x: number, y: number): Pt {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  beginPath() {
    this.subs = [];
  }
  closePath() {
    const s = this.subs[this.subs.length - 1];
    if (s) {
      s.closed = true;
      this.cur = this.userPt(s.pts[0]!);
    }
  }
  private userPt(p: Pt): Pt {
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c || 1;
    return [(d * (p[0] - e) - c * (p[1] - f)) / det, (a * (p[1] - f) - b * (p[0] - e)) / det];
  }
  moveTo(x: number, y: number) {
    this.subs.push({ pts: [this.tp(x, y)], closed: false });
    this.cur = [x, y];
  }
  lineTo(x: number, y: number) {
    const s = this.subs[this.subs.length - 1];
    if (!s || s.closed) return this.moveTo(x, y);
    s.pts.push(this.tp(x, y));
    this.cur = [x, y];
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    let sweep = a1 - a0;
    if (!ccw && sweep >= Math.PI * 2) sweep = Math.PI * 2;
    else if (ccw && sweep <= -Math.PI * 2) sweep = -Math.PI * 2;
    else if (!ccw && sweep < 0) sweep = ((sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    else if (ccw && sweep > 0) sweep = -(((-sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    const n = Math.max(KAPPA_STEPS, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 48));
    const cr = Math.cos(rot),
      sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const t = a0 + (sweep * i) / n;
      const px = Math.cos(t) * rx,
        py = Math.sin(t) * ry;
      const wx = x + px * cr - py * sr,
        wy = y + px * sr + py * cr;
      if (i === 0 && this.subs.length === 0) this.moveTo(wx, wy);
      else this.lineTo(wx, wy);
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    const [x0, y0] = this.cur;
    const v1: Pt = [x0 - x1, y0 - y1],
      v2: Pt = [x2 - x1, y2 - y1];
    const l1 = Math.hypot(...v1),
      l2 = Math.hypot(...v2);
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    if (!l1 || !l2 || Math.abs(cross) < 1e-9) return this.lineTo(x1, y1);
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))));
    const d = r / Math.tan(ang / 2);
    const p1: Pt = [x1 + (v1[0] / l1) * d, y1 + (v1[1] / l1) * d],
      p2: Pt = [x1 + (v2[0] / l2) * d, y1 + (v2[1] / l2) * d];
    const bis: Pt = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2];
    const bl = Math.hypot(...bis);
    const k = r / Math.sin(ang / 2);
    const cx = x1 + (bis[0] / bl) * k,
      cy = y1 + (bis[1] / bl) * k;
    this.lineTo(p1[0], p1[1]);
    this.arc(cx, cy, r, Math.atan2(p1[1] - cy, p1[0] - cx), Math.atan2(p2[1] - cy, p2[0] - cx), cross > 0);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const [x0, y0] = this.cur;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10,
        u = 1 - t;
      this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
    }
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    const [x0, y0] = this.cur;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12,
        u = 1 - t;
      this.lineTo(
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      );
    }
  }
  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const keep = this.subs;
    this.subs = [];
    this.rect(x, y, w, h);
    this.fill();
    this.subs = keep;
  }
  private trace(s: { pts: Pt[]; closed: boolean }) {
    this.g.beginPath();
    s.pts.forEach((p, i) => (i ? this.g.lineTo(p[0], p[1]) : this.g.moveTo(p[0], p[1])));
    if (s.closed) this.g.closePath();
  }
  fill() {
    const { rgb, a } = parseColor(solid(this.fillStyle));
    this.g.fillStyle(rgb, a * this.globalAlpha);
    for (const s of this.subs) {
      this.trace(s);
      this.g.fillPath();
    }
  }
  stroke() {
    const { rgb, a } = parseColor(solid(this.strokeStyle));
    const sc = Math.hypot(this.m[0], this.m[1]);
    this.g.lineStyle(this.lineWidth * sc, rgb, a * this.globalAlpha);
    for (const s of this.subs) {
      this.trace(s);
      this.g.strokePath();
    }
  }
  clip() {
    // Not supported on Graphics: parts meant for this adapter must not rely on clipping.
  }
  createLinearGradient() {
    return new Gradient();
  }
  createRadialGradient() {
    return new Gradient();
  }
}
