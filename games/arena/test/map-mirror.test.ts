import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, floorCount, generateMap, mirrorTile, solidAt } from '../map';
import { createManchazo, hashManchazo, matchResult } from '../sim';
import { play } from './match-drive';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);

describe('generated maps are mirrored left-right', () => {
  it('every tile equals its mirror image across the centre column, for 200 seeds', () => {
    for (const s of SEEDS) {
      const { map } = generateMap(s);
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) expect(solidAt(map, x, y)).toBe(solidAt(map, MAP_W - 1 - x, y));
    }
  });

  it('the exits of team 1 are the mirror image of team 0, and the two sides have the same floor', () => {
    for (const s of SEEDS) {
      const { map } = generateMap(s);
      expect(map.spawns[1]).toEqual(map.spawns[0]!.map(mirrorTile));
      const floor = [0, 0];
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!solidAt(map, x, y) && x !== 13) floor[x < 13 ? 0 : 1]!++;
      expect(floor[0]).toBe(floor[1]);
    }
  });
});

describe('mirror on a generated map: swapping the teams swaps the result', () => {
  for (const mapSeed of [11, 2222, 33333]) {
    it(`map seed ${mapSeed}: counts, painted tiles and winner mirror`, () => {
      const teams = [0, 1, 0, 1, 0];
      const slots = teams.map((_t, i) => i);
      const a = createManchazo({ slots, teams, seed: 4, mapSeed });
      expect(a.mapFallback).toBe(false);
      expect(a.match.paintable).toBeLessThan(MAP_W * MAP_H);
      for (const rs of [101, 202]) {
        const x = createManchazo({ slots, teams, seed: 4, mapSeed });
        const y = createManchazo({ slots, teams: teams.map((t) => 1 - t), seed: 4, mapSeed });
        play(x, rs, 2400);
        play(y, rs, 2400, true);
        expect(y.match.counts).toEqual([x.match.counts[1], x.match.counts[0]]);
        expect(x.match.counts[0]! + x.match.counts[1]!).toBeGreaterThan(0);
        for (let ty = 0; ty < MAP_H; ty++)
          for (let tx = 0; tx < MAP_W; tx++) {
            const pa = x.match.paint[ty * MAP_W + tx]!;
            expect(y.match.paint[ty * MAP_W + (MAP_W - 1 - tx)]).toBe(pa < 0 ? pa : 1 - pa);
          }
        for (let k = 0; k < MAP_W * MAP_H; k++)
          if (x.match.paint[k]! >= 0) expect(solidAt(x.grid.map, k % MAP_W, Math.floor(k / MAP_W))).toBe(false); // paint never lands on furniture
        expect(x.match.paintable).toBe(floorCount(x.grid.map));
        const wx = matchResult(x).winner;
        expect(matchResult(y).winner).toBe(wx === null ? null : 1 - wx);
        expect(hashManchazo(x)).not.toBe(hashManchazo(y));
      }
      expect(hashManchazo(a)).not.toBe(hashManchazo(createManchazo({ slots, teams, seed: 4, mapSeed: mapSeed + 1 })));
    });
  }
});
