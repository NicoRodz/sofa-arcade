// The F8b draws, made once when the round is created: where the balloons fall and which pieces of furniture Mudanza moves. Everything is a pair: the left member is
// drawn (columns 1-11 for balloons, 1-12 for furniture) and its mirror image (x -> 26 - x) comes with it, so both teams get the same.
import type { Rng } from '@pichi/core';
import {
  MAP_H,
  MAP_W,
  elementsOf,
  isValidMap,
  mirrorTile,
  solidAt,
  validateMap,
  type LivingSpec,
  type Tile,
  type TileMap,
} from '../../map';
import { MOVE_PAIRS } from './config';
import { substream } from './rng';

export interface MovePair {
  from: Tile; // a lone piece of furniture of the left half...
  to: Tile; // ...and the free tile it jumps to
}

const SPAWN_CLEAR = 3; // Manhattan tiles kept clear around an exit
const TRIES_BOX = 10; // furniture tried per pair
const TRIES_TO = 8; // destinations tried per piece
const TRIES_SET = 4; // whole selections tried against the living map before giving up

const shuffle = <T>(rng: Rng, xs: T[]): T[] => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
};

/** Balloon spots: BALLOON_PAIRS floor tiles of columns 3-11, at least 3 tiles (Chebyshev) from each other, so no two 3x3 touch (and none touches its mirror image). */
export function drawBalloons(map: TileMap, seed: number, pairs: number): Tile[] {
  const rng = substream(`manchazo:balloons:${seed}`);
  const cands: Tile[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 3; x <= 11; x++) if (!solidAt(map, x, y)) cands.push([x, y]);
  const out: Tile[] = [];
  for (const c of shuffle(rng, cands)) {
    if (out.every((o) => Math.max(Math.abs(o[0] - c[0]), Math.abs(o[1] - c[1])) >= 3)) out.push(c);
    if (out.length === pairs) break;
  }
  return out;
}

const lone = (map: TileMap, x: number, y: number, want: boolean): boolean =>
  solidAt(map, x, y) === want &&
  (
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const
  ).every(([dx, dy]) => x + dx >= 0 && x + dx < MAP_W && y + dy >= 0 && y + dy < MAP_H && !solidAt(map, x + dx, y + dy));

const withMoves = (map: TileMap, moves: readonly MovePair[]): TileMap => {
  const solid = map.solid.slice();
  for (const m of moves)
    for (const mem of [(t: Tile) => t, mirrorTile]) {
      const [fx, fy] = mem(m.from);
      const [tx, ty] = mem(m.to);
      solid[fy * map.w + fx] = 0;
      solid[ty * map.w + tx] = 1;
    }
  return { ...map, solid };
};

/**
 * The furniture Mudanza moves: MOVE_PAIRS lone pieces (a 1x1 box with no furniture beside it) of columns 1-12, each to a free tile that also has none beside it. A
 * selection is kept only if the moved map passes V1-V7 (and V1-V3 in every state of the living map), so nobody can be shut in whatever the players do. `avoid`:
 * tiles that must stay as they are (living parts' footprints, sabotage pickups). Fewer than MOVE_PAIRS valid pairs: none, and Mudanza leaves the pool.
 */
export function drawMoves(map: TileMap, seed: number, living: readonly LivingSpec[], avoid: ReadonlySet<number>): MovePair[] {
  const rng = substream(`manchazo:move:${seed}`);
  const free = (x: number, y: number) =>
    !avoid.has(y * MAP_W + x) && !map.spawns.some((t) => t.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= SPAWN_CLEAR));
  const boxes: Tile[] = [];
  const floors: Tile[] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 1; x <= 12; x++) {
      if (!free(x, y)) continue;
      if (lone(map, x, y, true)) boxes.push([x, y]);
      else if (lone(map, x, y, false)) floors.push([x, y]);
    }
  for (let set = 0; set < TRIES_SET; set++) {
    const picked: MovePair[] = [];
    let cur = map;
    for (const from of shuffle(rng, [...boxes]).slice(0, TRIES_BOX * MOVE_PAIRS)) {
      if (picked.length === MOVE_PAIRS) break;
      if (picked.some((p) => p.to[0] === from[0] && p.to[1] === from[1])) continue;
      for (const to of shuffle(rng, [...floors]).slice(0, TRIES_TO)) {
        if (picked.some((p) => (p.to[0] === to[0] && p.to[1] === to[1]) || Math.abs(p.to[0] - to[0]) + Math.abs(p.to[1] - to[1]) < 2))
          continue;
        const next = withMoves(cur, [{ from, to }]);
        if (!isValidMap(next)) continue;
        picked.push({ from, to });
        cur = next;
        break;
      }
    }
    if (picked.length === MOVE_PAIRS && validateMap(withMoves(map, picked), elementsOf(living), false).length === 0) return picked;
  }
  return [];
}
