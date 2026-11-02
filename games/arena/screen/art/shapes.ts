// Small Graphics helpers shared by the vector art of the scene (polygons, stars, a teardrop). They only call Phaser's Graphics; no state.
import type Phaser from 'phaser';
import { A, num } from './palette';

export type G = Phaser.GameObjects.Graphics;

/** A closed polygon: filled with `fill` and outlined with `ink` (width `lw`); either can be left out. */
export function poly(g: G, pts: readonly (readonly [number, number])[], fill?: number, ink?: number, lw = 3, alpha = 1): void {
  g.beginPath().moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.closePath();
  if (fill !== undefined) g.fillStyle(fill, alpha).fillPath();
  if (ink !== undefined) g.lineStyle(lw, ink, alpha).strokePath();
}

export function starPts(cx: number, cy: number, ro: number, ri: number, n: number, rot: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? ri : ro;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export const star = (
  g: G,
  cx: number,
  cy: number,
  ro: number,
  ri: number,
  n: number,
  rot: number,
  fill?: number,
  ink?: number,
  lw = 3,
): void => poly(g, starPts(cx, cy, ro, ri, n, rot), fill, ink, lw);

/** An ellipse as a polygon turned by `rot` (Graphics cannot rotate its ellipses). */
export function tilted(cx: number, cy: number, rx: number, ry: number, rot: number, n = 14): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx,
      y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

export const INK = num(A.ink);
export const CREAM = num(A.cream);
export const WHITE = 0xffffff;
