// Collision helpers for what the F1 stepPlayer does not do: displacements applied from outside (rope, belts, climbing, carried boxes)
// and the ground test after them. Solid tiles only; one-way tiles are ignored on purpose (a rope never drags you through a floor, but
// it may pull you up through a one-way).
import { LEDGE_PX, PLAYER_H, PLAYER_W, TILE } from '../constants';
import { isOneWayKind, isSolidKind } from '../legend';
import type { Body, Platform } from './player';
import { boxHitsSolid, tileAt, tileOf, type TileGrid } from './tiles';

const EPS = 1e-6;
export interface Pos {
  x: number;
  y: number;
}

// Largest fraction of (dx,0) that keeps the box free, by bisection. Returns the applied dx. A box that already overlaps a solid
// may only move to a free spot (never deeper).
function slideAxis(g: TileGrid, p: Pos, w: number, h: number, dx: number, dy: number): number {
  const d = dx !== 0 ? dx : dy;
  if (d === 0) return 0;
  const free = (t: number) => !boxHitsSolid(g, p.x + (dx !== 0 ? dx * t : 0), p.y + (dy !== 0 ? dy * t : 0), w, h);
  if (free(1)) return d;
  if (!free(0)) return 0;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (free(mid)) lo = mid;
    else hi = mid;
  }
  return d * lo;
}

// Moves a box in X and then in Y against solid tiles; returns the displacement actually applied.
export function pushRect(g: TileGrid, p: Pos, w: number, h: number, dx: number, dy: number): Pos {
  const ax = slideAxis(g, p, w, h, dx, 0);
  p.x += ax;
  const ay = slideAxis(g, p, w, h, 0, dy);
  p.y += ay;
  return { x: ax, y: ay };
}
export const pushBody = (b: Body, dx: number, dy: number, g: TileGrid): Pos => pushRect(g, b, PLAYER_W, PLAYER_H, dx, dy);

// Sideways move with the ledge help of stepPlayer (a wall top within LEDGE_PX of the feet lifts the body). Used on ladders.
export function moveXLedge(b: Body, dx: number, g: TileGrid): void {
  if (dx === 0) return;
  const nx = b.x + dx;
  const hits = (x: number, y: number) => boxHitsSolid(g, x, y, PLAYER_W, PLAYER_H);
  if (!hits(nx, b.y)) {
    b.x = nx;
    return;
  }
  for (let k = 1; k <= LEDGE_PX; k++)
    if (!hits(nx, b.y - k)) {
      b.x = nx;
      b.y -= k;
      return;
    }
  b.x = dx > 0 ? tileOf(nx + PLAYER_W - EPS) * TILE - PLAYER_W : (tileOf(nx) + 1) * TILE;
  b.vx = 0;
}

export interface Support {
  grounded: boolean;
  supportId: number;
  onOneWay: boolean;
  kind: number;
}
// What the body stands on right now (within tol px of its feet), without moving it. Used after the rope moved bodies around.
export function supportBelow(b: Body, g: TileGrid, platforms: readonly Platform[], tol = 0.6): Support {
  const none: Support = { grounded: false, supportId: -1, onOneWay: false, kind: 0 };
  if (b.vy < -1) return none;
  const feet = b.y + PLAYER_H;
  const row = Math.round(feet / TILE);
  const x0 = tileOf(b.x),
    x1 = tileOf(b.x + PLAYER_W - EPS);
  let oneWay: Support | null = null;
  if (Math.abs(row * TILE - feet) <= tol) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(g, tx, row);
      if (isSolidKind(k)) return { grounded: true, supportId: -1, onOneWay: false, kind: k };
      if (isOneWayKind(k) && b.dropFrames === 0 && !oneWay) oneWay = { grounded: true, supportId: -1, onOneWay: true, kind: k };
    }
  }
  if (oneWay) return oneWay;
  if (b.dropFrames === 0) {
    for (const p of platforms) {
      if (p.id === b.id || !p.oneWay) continue;
      if (b.x < p.x + p.w && b.x + PLAYER_W > p.x && Math.abs(p.y - feet) <= tol)
        return { grounded: true, supportId: p.id, onOneWay: true, kind: -1 };
    }
  }
  return none;
}

// --- rect geometry (px)
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: PxRect, b: PxRect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const bodyRect = (b: Body): PxRect => ({ x: b.x, y: b.y, w: PLAYER_W, h: PLAYER_H });
export const cellRect = (cx: number, cy: number): PxRect => ({ x: cx * TILE, y: cy * TILE, w: TILE, h: TILE });
export const center = (b: Body): Pos => ({ x: b.x + PLAYER_W / 2, y: b.y + PLAYER_H / 2 });
// Distance from a point to the nearest point of a rect (0 if inside).
export function distToRect(px: number, py: number, r: PxRect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w)),
    dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}
// Distance between two rects (0 if they touch or overlap).
export function rectGap(a: PxRect, b: PxRect): number {
  const dx = Math.max(a.x - (b.x + b.w), 0, b.x - (a.x + a.w)),
    dy = Math.max(a.y - (b.y + b.h), 0, b.y - (a.y + a.h));
  return Math.hypot(dx, dy);
}
