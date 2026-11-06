import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { MAP_H, MAP_W, emptyMap, type TileMap } from '../map';
import { LEFT, NONE, RIGHT, createGrid, stepGrid, type ControlPlan, type Dir, type GridInput } from '../sim';

const flipDir = (d: Dir): Dir => (d === RIGHT ? LEFT : d === LEFT ? RIGHT : d);

/** A symmetric map: random furniture on the left half, mirrored to the right; the spawn on the axis side. */
function symmetricMap(seed: number): TileMap {
  const rnd = mulberry32(seed);
  const m = emptyMap([[[1, 1]], [[MAP_W - 2, 1]]]);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (x <= (MAP_W - 1) / 2 && rnd() < 0.28 && !(x < 3 && y < 3)) m.solid[y * MAP_W + x] = m.solid[y * MAP_W + (MAP_W - 1 - x)] = 1;
  return m;
}

describe('grid control mirror: the same run seen in a mirror (stick x flipped) is the mirror, tick by tick', () => {
  for (const plan of ['A', 'B'] as const)
    it(`plan ${plan}: positions mirror (x' = W - x), headings mirror, the turn stats are equal`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const map = symmetricMap(seed);
        const a = createGrid({ slots: [0, 1], teams: [0, 1], control: plan as ControlPlan, durationTicks: 1e6, map });
        const rnd = mulberry32(seed * 977);
        let cur: GridInput = { sx: 0, sy: 0 };
        let left = 0;
        const [p, q] = [a.bodies[0]!, a.bodies[1]!]; // body 1 starts at the mirror tile of body 0 and gets the flipped stick
        for (let t = 0; t < 3000; t++) {
          if (left-- <= 0) {
            left = 2 + Math.floor(rnd() * 30);
            const ang = rnd() * Math.PI * 2;
            const mag = rnd() < 0.12 ? 100 : 250 + Math.floor(rnd() * 750);
            cur = { sx: Math.round(Math.cos(ang) * mag), sy: Math.round(Math.sin(ang) * mag) };
          }
          if (rnd() < 0.03)
            for (const b of [p, q]) {
              b.dir = NONE;
              b.moved = false;
            } // a pinata drop or a roll: the body is put standing
          stepGrid(
            a,
            new Map<number, GridInput>([
              [0, cur],
              [1, { sx: -cur.sx, sy: cur.sy }],
            ]),
          );
          expect([q.x, q.y, q.dir, q.q]).toEqual([MAP_W * 16 - p.x, p.y, flipDir(p.dir), p.q === NONE ? NONE : flipDir(p.q)]);
          expect(q.stats).toEqual(p.stats);
        }
      }
    });
});
