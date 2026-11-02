import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, emptyMap, f0Map, generateMap, solidAt, type TileMap } from '../../map';
import { planFurniture } from '../../screen/art/furniture-plan';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 104729 + 7);
const maps: [string, TileMap][] = [['f0', f0Map()], ...SEEDS.map((s): [string, TileMap] => [`seed ${s}`, generateMap(s).map])];

describe('furniture plan: every wall tile is part of exactly one piece', () => {
  it.each(maps)('%s: pieces cover all wall tiles, never a floor tile, never twice', (_name, map) => {
    const owner = new Int16Array(MAP_W * MAP_H);
    for (const p of planFurniture(map))
      for (let j = 0; j < p.h; j++)
        for (let i = 0; i < p.w; i++) {
          expect(solidAt(map, p.x + i, p.y + j), `piece ${p.kind} at ${p.x},${p.y} covers a floor tile`).toBe(true);
          owner[(p.y + j) * MAP_W + p.x + i]!++;
        }
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) expect(owner[y * MAP_W + x], `tile ${x},${y}`).toBe(map.solid[y * MAP_W + x] === 1 ? 1 : 0);
  });

  it('a wall of 3 in a row is one sofa, a run of 7 is cut into sofas of at most 3', () => {
    const m = emptyMap();
    for (let x = 2; x < 5; x++) m.solid[4 * MAP_W + x] = 1;
    expect(planFurniture(m)).toMatchObject([{ kind: 'sofa', x: 2, y: 4, w: 3, h: 1 }]);
    const long = emptyMap();
    for (let x = 2; x < 9; x++) long.solid[4 * MAP_W + x] = 1;
    const sofas = planFurniture(long);
    expect(sofas.map((p) => p.w)).toEqual([3, 3, 1]);
    expect(sofas.map((p) => p.kind)).toEqual(['sofa', 'sofa', expect.stringMatching(/table|pouf/)]);
  });

  it('a vertical run is one sofa turned on its side and a lone tile a table or pouf', () => {
    const m = emptyMap();
    for (let y = 2; y < 4; y++) m.solid[y * MAP_W + 6] = 1;
    m.solid[8 * MAP_W + 10] = 1;
    const plan = planFurniture(m);
    expect(plan).toMatchObject([
      { kind: 'sofa-side', x: 6, y: 2, w: 1, h: 2 },
      { kind: expect.stringMatching(/table|pouf/), x: 10, y: 8, w: 1, h: 1 },
    ]);
  });

  it('an empty map has no furniture', () => {
    expect(planFurniture(emptyMap())).toEqual([]);
  });
});
