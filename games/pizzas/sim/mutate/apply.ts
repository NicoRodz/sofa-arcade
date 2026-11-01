// Applies a mutation to a live round in ONE tick: the grid gets the new tiles, a counter that appears becomes a station, and whatever stood on a tile that
// stopped being floor (chefs, loose items) is moved to the nearest floor tile; ties are broken with the mutation's own stream, so the same round always ends up the same.
import type { Rng } from '@pichi/core';
import { isFloor, parseTile } from '../maps';
import type { Game } from '../round/state';
import { newSurfaceState } from '../surfaces/config';
import type { Mutation } from './plan';

/** The floor tile nearest to (x, y) (chebyshev rings; the same distance: the stream picks). Null if the kitchen has no floor at all. */
export function nearestFloor(g: Game, x: number, y: number, rng: Rng): [number, number] | null {
  const rows = g.grid.length,
    cols = g.grid[0]!.length;
  for (let r = 1; r < Math.max(rows, cols); r++) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isFloor(g.grid, x + dx, y + dy)) ring.push([x + dx, y + dy]);
    if (ring.length) return ring[Math.floor(rng() * ring.length)]!;
  }
  return null;
}

/** Returns how many chefs and items were relocated. */
export function applyMutation(g: Game, m: Mutation, rng: Rng): number {
  for (const t of m.tiles) {
    const tile = parseTile(t.to);
    if (!tile || !g.grid[t.y]?.[t.x]) continue;
    g.grid[t.y]![t.x] = tile;
    if (tile.kind === 'station')
      g.stations.push({
        kind: tile.station,
        tx: t.x,
        ty: t.y,
        crate: tile.crate,
        item: null,
        progress: 0,
        inputs: [],
        done: false,
        count: 0,
        clean: 0,
        owner: 0,
      });
  }
  if (m.tiles.some((t) => t.to === 'i' || '→←↑↓'.includes(t.to))) g.surf ??= newSurfaceState(); // ice and belts only act in a round that has `surf`
  let moved = 0;
  for (const p of g.players.values()) {
    const x = Math.floor(p.x),
      y = Math.floor(p.y);
    if (isFloor(g.grid, x, y)) continue;
    const to = nearestFloor(g, x, y, rng);
    if (!to) continue;
    p.x = to[0] + 0.5;
    p.y = to[1] + 0.5;
    p.vx = 0;
    p.vy = 0;
    moved++;
  }
  for (const f of g.floor) {
    if (isFloor(g.grid, f.tx, f.ty)) continue;
    const to = nearestFloor(g, f.tx, f.ty, rng);
    if (!to) continue;
    f.tx = to[0];
    f.ty = to[1];
    moved++;
  }
  return moved;
}
