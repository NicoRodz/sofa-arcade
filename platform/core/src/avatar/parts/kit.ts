// Drawing kit shared by every avatar part: outline colour, path helpers and small shape builders. Pure: talks only to Painter.
import type { Painter } from '../painter';

export const INK = '#2A211C';
export const OUT = 3;
export const TAU = Math.PI * 2;
export type View = 'front' | 'side' | 'back';
export type Pt = readonly [number, number];

/** Multiplies each RGB channel (k < 1 darkens, k > 1 lightens, clamped). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Fills the current path with `fill` and draws the standard 3 px ink outline. */
export function paint(p: Painter, fill: string): void {
  p.fillStyle = fill;
  p.fill();
  p.lineWidth = OUT;
  p.lineJoin = 'round';
  p.strokeStyle = INK;
  p.stroke();
}

export function poly(p: Painter, pts: readonly Pt[]): void {
  p.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
}

export function ell(p: Painter, x: number, y: number, rx: number, ry: number, rot = 0): void {
  p.beginPath();
  p.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** Rounded rectangle from its top-left corner. */
export function rrect(p: Painter, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  p.beginPath();
  p.moveTo(x + k, y);
  p.arcTo(x + w, y, x + w, y + h, k);
  p.arcTo(x + w, y + h, x, y + h, k);
  p.arcTo(x, y + h, x, y, k);
  p.arcTo(x, y, x + w, y, k);
  p.closePath();
}

/** A thick capsule from (x0,y0) to (x1,y1): ink underlay first, then the colour. */
export function limb(p: Painter, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  p.lineCap = 'round';
  p.beginPath();
  p.moveTo(x0, y0);
  p.lineTo(x1, y1);
  p.strokeStyle = INK;
  p.lineWidth = w + 2 * OUT;
  p.stroke();
  p.strokeStyle = color;
  p.lineWidth = w;
  p.stroke();
}

/** The single highlight of a piece: a soft white ellipse. */
export function shine(p: Painter, x: number, y: number, rx: number, ry: number, rot = 0): void {
  const a = p.globalAlpha;
  p.globalAlpha = a * 0.35;
  ell(p, x, y, rx, ry, rot);
  p.fillStyle = '#FFFFFF';
  p.fill();
  p.globalAlpha = a;
}

/** Star outline points (outer radius R, inner r) centred at (x,y). */
export function star(x: number, y: number, R: number, r: number, n = 5): Pt[] {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const d = i % 2 === 0 ? R : r;
    return [x + Math.cos(a) * d, y + Math.sin(a) * d] as const;
  });
}
