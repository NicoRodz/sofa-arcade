// Geometry and lookup helpers of the phone layout rules (checks.ts): box containment, overlap, circles, and Probe item lookups.
import type { Box, Item, Probe } from './harness';

export const EPS = 0.75;

export const inside = (b: Box, o: Box, tol = EPS) =>
  b.x >= o.x - tol && b.y >= o.y - tol && b.x + b.w <= o.x + o.w + tol && b.y + b.h <= o.y + o.h + tol;
export const rectsHit = (a: Box, b: Box) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
export const corners = (b: Box) =>
  [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ] as const;
export const dist = (px: number, py: number, c: { cx: number; cy: number }) => Math.hypot(px - c.cx, py - c.cy);
export const circleOf = (b: Box) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.min(b.w, b.h) / 2 });
// circle vs rectangle: distance from the centre to the closest point of the rectangle
export const circleHitsRect = (b: Box, r: Box) => {
  const c = circleOf(b);
  const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w)),
    ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
  return dist(nx, ny, c) < c.r - EPS;
};

export const one = (p: Probe, sel: string) => p.items.find((i) => i.sel === sel);
export const all = (p: Probe, sel: string) => p.items.filter((i) => i.sel === sel);
export const safeRect = (p: Probe): Box => ({
  x: p.inset.left,
  y: p.inset.top,
  w: p.vw - p.inset.left - p.inset.right,
  h: p.vh - p.inset.top - p.inset.bottom,
});
export const fmt = (b: Box) => `[${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)}]`;
export const nm = (i: Item) => `${i.sel}#${i.i}`;
