// The living map is drawn by its elements (brush, sofa, fountain), never as furniture: no piece of the floor's furniture may sit on a tile an element ever crosses, and an
// element may never close a tile that was a wall. Seen in the F7b capture of the Hourglass event: a brush arm drawn over a sofa (the plan was made from the sim's live tiles).
import { describe, expect, it } from 'vitest';
import { FOUNTAIN_TILE, MAP_W, footprint, generateMap, hashMap } from '../../map';
import { createManchazo, stepManchazo, type ManchazoState } from '../../sim';
import { furnitureMap, planFurniture } from '../../screen/art/furniture-plan';

const withAll = (from: number, want: number) => {
  const out: number[] = [];
  for (let seed = from; out.length < want; seed += 101) {
    if (new Set(generateMap(seed, undefined, true).living.map((l) => l.kind)).size === 3) out.push(seed);
  }
  return out;
};
const MAPS = withAll(3, 8);
const round = (mapSeed: number): ManchazoState => createManchazo({ slots: [0, 1], teams: [0, 1], seed: 9, mapSeed, living: true });
const key = (x: number, y: number) => y * MAP_W + x;

describe('living map and furniture never share a tile', () => {
  it.each(MAPS)('map %i: no piece covers a tile an element crosses, and the plan never changes while the elements move', (mapSeed) => {
    const s = round(mapSeed);
    const live = s.match.live!;
    const ever = new Set<number>([key(FOUNTAIN_TILE[0], FOUNTAIN_TILE[1])]);
    for (const p of live.pairs) for (const [x, y] of footprint(p.spec)) ever.add(key(x, y));
    expect(ever.size).toBeGreaterThan(1);
    const plan = (st: ManchazoState) => planFurniture(furnitureMap(st.grid.map, st.match.live));
    const first = JSON.stringify(plan(s));
    const key0 = hashMap(furnitureMap(s.grid.map, live));
    for (const piece of plan(s))
      for (let j = 0; j < piece.h; j++)
        for (let i = 0; i < piece.w; i++)
          expect(ever.has(key(piece.x + i, piece.y + j)), `${piece.kind} at ${piece.x + i},${piece.y + j} is on a living tile`).toBe(false);
    for (const t of ever) expect(live.base[t], `living tile ${t % MAP_W},${Math.floor(t / MAP_W)} is a wall in the base`).toBe(0); // the element never steps on a wall
    for (let t = 0; t < 1500; t++) {
      stepManchazo(s, new Map());
      for (let i = 0; i < s.grid.map.solid.length; i++)
        if (s.grid.map.solid[i] !== live.base[i])
          expect(ever.has(i), `tick ${t}: tile ${i % MAP_W},${Math.floor(i / MAP_W)} shut but not in any footprint`).toBe(true);
      if (t % 50 === 0) {
        expect(JSON.stringify(plan(s))).toBe(first); // the same furniture whatever state the elements are in...
        expect(hashMap(furnitureMap(s.grid.map, s.match.live))).toBe(key0); // ...so the baked floor is made once
      }
    }
    expect(
      live.pairs.some((p) => p.movedAt >= 0),
      'the elements moved during the run',
    ).toBe(true);
  });
});
