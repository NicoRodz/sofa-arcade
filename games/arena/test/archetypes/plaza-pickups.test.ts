import { describe, expect, it } from 'vitest';
import { MAP_W, PLAZA_H, archetypeOf, plazaRect } from '../../map';
import { createManchazo, placePickups } from '../../sim';

const PLAZA_SEEDS = Array.from({ length: 4000 }, (_, i) => (i * 3359 + 17) % 33_554_432)
  .filter((s) => archetypeOf(s) === 'plaza')
  .slice(0, 40);
const round = (mapSeed: number, seed: number, classicMap = false) =>
  createManchazo({ slots: [0, 1], teams: [0, 1], seed, mapSeed, sabotage: true, ...(classicMap ? { classicMap } : {}) });

describe('the sabotage pickups of a Plaza round', () => {
  it('stand inside the plaza (a free 7x5 on the middle line), in 3 mirror pairs, on 40 seeds x 3 round seeds', () => {
    for (const mapSeed of PLAZA_SEEDS)
      for (const seed of [3, 8, 21]) {
        const s = round(mapSeed, seed);
        const r = plazaRect(s.grid.map)!;
        const ps = s.match.sab!.pickups;
        expect(ps.length, `map ${mapSeed} seed ${seed}`).toBe(6);
        for (const p of ps) {
          expect(p.x, `map ${mapSeed} seed ${seed}`).toBeGreaterThanOrEqual(r.x);
          expect(p.x).toBeLessThan(r.x + 7);
          expect(p.y).toBeGreaterThanOrEqual(r.y);
          expect(p.y).toBeLessThan(r.y + PLAZA_H);
        }
        for (let k = 0; k < 6; k += 2) expect([ps[k + 1]!.x, ps[k + 1]!.y]).toEqual([MAP_W - 1 - ps[k]!.x, ps[k]!.y]);
        expect(new Set(ps.map((p) => p.y * MAP_W + p.x)).size).toBe(6);
      }
  });

  it('a Plaza map played as Clasico (classicMap) or any plain map keeps the old placement: one pair per band of rows', () => {
    const s = round(PLAZA_SEEDS[0]!, 3, true);
    expect(s.match.sab!.pickups).toEqual(placePickups(s.grid.map, 3, undefined));
  });
});
