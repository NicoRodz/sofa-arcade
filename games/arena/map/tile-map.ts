// The map the sim plays on: furniture per tile plus the exits (spawn tiles) of each team. A round holds one; the F0 hand-made map is the fallback.
// Pure data and lookups: nothing runs when the file loads (the F0 map is built on first use).
import { MAP_H, MAP_ROWS, MAP_W, SPAWNS_LEFT } from './layout';

export type Tile = readonly [number, number];

export interface TileMap {
  w: number;
  h: number;
  solid: Uint8Array; // per tile (y * w + x): 1 furniture, 0 floor
  spawns: readonly (readonly Tile[])[]; // per team, in the order its members take them (also the team's exits: the generator validates them)
}

export const emptyMap = (spawns: TileMap['spawns'] = [[], []]): TileMap => ({
  w: MAP_W,
  h: MAP_H,
  solid: new Uint8Array(MAP_W * MAP_H),
  spawns,
});

/** Furniture or out of bounds. */
export const solidAt = (m: TileMap, x: number, y: number): boolean => x < 0 || y < 0 || x >= m.w || y >= m.h || m.solid[y * m.w + x] === 1;

export const floorCount = (m: TileMap): number => m.solid.reduce((n, v) => n + (v === 1 ? 0 : 1), 0);

/** The team 1 image of a tile of team 0: the map is mirrored left-right. */
export const mirrorTile = ([x, y]: Tile): Tile => [MAP_W - 1 - x, y];

let f0: TileMap | undefined;
/** The F0 prototype map (hand made, '#' furniture): the fallback when a seed does not validate, and the default of a round that asks for no seed. */
export function f0Map(): TileMap {
  if (f0) return f0;
  const m = emptyMap([SPAWNS_LEFT, SPAWNS_LEFT.map(mirrorTile)]);
  MAP_ROWS.forEach((row, y) => [...row].forEach((c, x) => (m.solid[y * MAP_W + x] = c === '#' ? 1 : 0)));
  return (f0 = m);
}

/** FNV-1a over the furniture and the exits: part of the round's hash, so a replay on another map does not match. */
export function hashMap(m: TileMap): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => (h = Math.imul(h ^ (v & 0xff), 0x01000193));
  for (const v of m.solid) mix(v);
  for (const team of m.spawns) for (const [x, y] of team) mix(x), mix(y);
  return h >>> 0;
}
