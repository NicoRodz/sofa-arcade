// Oil, fire and water on the floor (design section 3): `game.mech.tile` holds 0 nothing, 1 oil, 2 fire, 3 water per tile (index y * 16 + x) and `tileT` the ticks it has left.
// Everything is integers and tile order: no RNG here (the Derrame event rolls with the events' own stream, see spill.ts).
import type { Game } from '../../round/state';

export const OIL = 1,
  FIRE = 2,
  WATER = 3;
export const TILES = 16 * 9;
export const OIL_TICKS = 1800; // a spilt patch dries after this (a map's own `a` never dries: tileT 0)
export const FIRE_TICKS = 360; // a burning tile is a wall this long, then it is clean floor
export const WATER_TICKS = 300;
export const FIRE_JUMP = 45; // the fire hops from oil to oil this often
export const DRIP_EVERY = 720; // a gotera `g` oils a neighbour this often
export const SAUCE_WAIT = 480; // a ready sauce pot nobody empties oils its four neighbours after this
export const WIPE_OIL = 60; // ticks of B held in front of an oil tile to clean it (two chefs add up)
export const WIPE_FIRE = 180; // ... in front of a fire tile
export const NESW = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export interface OilExt {
  tick: number;
  drops: number[]; // tile index of every g
  drips: Record<number, number>; // g -> how many drops it has made (the rotation of the neighbour)
  sauce: Record<number, number>; // saucepot station index -> ticks its sauce has waited ready
  spilt: Record<number, boolean>; // ... and whether it already oiled its neighbours for this batch
  work: Record<number, number>; // tile index -> ticks of B held on it in this run (it restarts when nobody holds B on it for a tick)
  hot: Record<number, boolean>; // tiles a chef held B on during this tick
  on: Record<number, number>; // chef id -> the tile it stood on last tick (HAZARD_V3 drop on oil)
  lastDropAt?: number; // match time of the last item an oil tile made a chef drop
}
export const ext = (g: Game) => g.mech!.ext!.oil as OilExt;
export const at = (g: Game, idx: number) => g.mech!.tile![idx] ?? 0;

export const tileIdx = (x: number, y: number) => (x < 0 || y < 0 || x >= 16 || y >= 9 ? -1 : y * 16 + x);
export function setTile(g: Game, idx: number, kind: number, ticks: number) {
  g.mech!.tile![idx] = kind;
  g.mech!.tileT![idx] = ticks;
}
/** A tile where oil or fire may appear: plain floor (no other mechanic's letter but `a`), and no chef standing on it. */
export function freeFloor(g: Game, idx: number): boolean {
  if (idx < 0) return false;
  const t = g.grid[Math.floor(idx / 16)]?.[idx % 16];
  if (t?.kind !== 'floor' || (t.mech && t.mech !== 'a')) return false;
  for (const p of g.players.values()) if (!p.ghost && Math.floor(p.y) * 16 + Math.floor(p.x) === idx) return false;
  return true;
}
export const anyOil = (g: Game): boolean => !!g.mech?.tile && g.mech.tile.some((v) => v === OIL || v === FIRE);
/** One tick of age for every oil, fire and water tile: a tile whose time runs out is clean (a time of 0 means it never dries). */
export function ageTiles(g: Game) {
  const tile = g.mech!.tile!,
    left = g.mech!.tileT!;
  for (let i = 0; i < TILES; i++) {
    const t = left[i] ?? 0;
    if (!t || !tile[i]) continue;
    left[i] = t - 1;
    if (t === 1) tile[i] = 0;
  }
}
