import { mulberry32 } from '@pichi/core';
import { describe, expect, it } from 'vitest';
import { floorCount, generateMap, solidAt, type TileMap } from '../map';
import { createGrid, stepGrid, type GridInput } from '../sim';
import { RouteBot, distanceField } from './route-bot';

const MAX_TICKS = 60_000; // 1000 s at 60 Hz: far above what a tour of ~320 tiles needs (about 10 000)

const NEAR = 3; // units (of 16 per tile) from a tile centre that count as having stood on it

/**
 * The test bot that walks everything: it chases the nearest tile it has not stood on, by the shortest path (RouteBot), then pulls to the tile's centre so the
 * next turn is legal (a turn needs the body within 0.35 tile of a centre). It plays through the real grid sim: corners, corner assist, 4 tiles/s.
 */
function walkAll(map: TileMap): { visited: Set<number>; ticks: number; floor: number } {
  const s = createGrid({ slots: [0], map, durationTicks: 10 ** 9 });
  const b = s.bodies[0]!;
  const visited = new Set<number>();
  const mark = () => {
    const tx = Math.floor(b.x / 16);
    const ty = Math.floor(b.y / 16);
    if (Math.abs(b.x - (tx * 16 + 8)) <= NEAR && Math.abs(b.y - (ty * 16 + 8)) <= NEAR) visited.add(ty * map.w + tx);
  };
  mark();
  let bot: RouteBot | null = null;
  let target = -1;
  let ticks = 0;
  for (; ticks < MAX_TICKS; ticks++) {
    if (target >= 0 && visited.has(target)) target = -1;
    if (target < 0) {
      const field = distanceField(Math.floor(b.x / 16), Math.floor(b.y / 16), map); // steps from the body to every tile
      for (let i = 0; i < field.length; i++)
        if (field[i]! >= 0 && !visited.has(i) && (target < 0 || field[i]! < field[target]!)) target = i;
      if (target < 0) break; // nothing left to visit
      bot = new RouteBot([[target % map.w, Math.floor(target / map.w)]], map);
    }
    const cx = (target % map.w) * 16 + 8;
    const cy = Math.floor(target / map.w) * 16 + 8;
    const input: GridInput = !bot!.done
      ? bot!.input(b)
      : Math.abs(b.x - cx) > 1
        ? { sx: b.x < cx ? 1000 : -1000, sy: 0 }
        : { sx: 0, sy: b.y < cy ? 1000 : -1000 };
    stepGrid(s, new Map<number, GridInput>([[0, input]]));
    mark();
  }
  return { visited, ticks, floor: floorCount(map) };
}

describe('playability: the test bot walks every floor tile of a generated map', () => {
  for (const seed of [1, 2, 3, 424242, 33_554_431]) {
    it(`seed ${seed}: all floor tiles visited, none on furniture, inside the tick budget`, () => {
      const g = generateMap(seed);
      expect(g.fallback).toBe(false);
      const { visited, ticks, floor } = walkAll(g.map);
      for (const i of visited) expect(solidAt(g.map, i % g.map.w, Math.floor(i / g.map.w))).toBe(false);
      expect(visited.size).toBe(floor);
      expect(ticks).toBeLessThan(MAX_TICKS);
    });
  }

  it('the bodies start on the first exit of each team', () => {
    const g = generateMap(7);
    const s = createGrid({ slots: [0, 1], teams: [0, 1], map: g.map });
    expect(s.bodies.map((b) => [Math.floor(b.x / 16), Math.floor(b.y / 16)])).toEqual([g.map.spawns[0]![0], g.map.spawns[1]![0]]);
  });

  it('a player pushing the stick at random never gets a corner of its footprint into furniture', () => {
    for (const seed of [5, 6, 7]) {
      const { map } = generateMap(seed);
      const s = createGrid({ slots: [0], map, durationTicks: 10 ** 9 });
      const b = s.bodies[0]!;
      const rnd = mulberry32(seed);
      let input: GridInput = { sx: 0, sy: 0 };
      for (let t = 0; t < 6000; t++) {
        if (t % 20 === 0)
          input =
            rnd() < 0.2 ? { sx: 0, sy: 0 } : { sx: Math.round(Math.cos(rnd() * 6.3) * 1000), sy: Math.round(Math.sin(rnd() * 6.3) * 1000) };
        stepGrid(s, new Map([[0, input]]));
        for (const [dx, dy] of [
          [-8, -8],
          [7, -8],
          [-8, 7],
          [7, 7],
        ] as const)
          expect(solidAt(map, Math.floor((b.x + dx) / 16), Math.floor((b.y + dy) / 16))).toBe(false);
      }
    }
  });
});
