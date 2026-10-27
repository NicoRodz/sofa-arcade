// The two test maps (not in the lobby) read only with their flag: without it the letters M, Q and W are a load error, never floor.
import { describe, expect, it } from 'vitest';
import { KNEADER_ROWS } from './map';
import { WOOD_ROWS } from '../woodOven/map';
import { createGame } from '../../../sim/overcooked';
import { parseMap } from '../../../sim/maps';

describe('test maps', () => {
  it('the kneader map needs flags.mech.kneader', () => {
    expect(() => parseMap(KNEADER_ROWS)).toThrow(/mech\.kneader/);
    const g = createGame({ rows: KNEADER_ROWS, mech: { kneader: true } });
    expect(g.stations.filter((s) => s.kind === 'kneader')).toHaveLength(1);
    expect(Object.keys(g.mech!.kneader!)).toHaveLength(1);
  });
  it('the wood-oven map needs flags.mech.woodOven; W is an oven and Q a bellows', () => {
    expect(() => parseMap(WOOD_ROWS)).toThrow(/mech\.woodOven/);
    const g = createGame({ rows: WOOD_ROWS, mech: { woodOven: true } });
    expect(g.stations.filter((s) => s.kind === 'pot' && s.wood)).toHaveLength(1);
    expect(g.stations.filter((s) => s.kind === 'bellows')).toHaveLength(1);
    expect(Object.values(g.mech!.wood!)).toEqual([0]);
  });
  it('both maps are 16 x 9 with eight spawns', () => {
    for (const rows of [KNEADER_ROWS, WOOD_ROWS]) {
      expect(rows).toHaveLength(9);
      expect(rows.every((r) => r.length === 16)).toBe(true);
      expect(rows.join('').split('S')).toHaveLength(9);
    }
  });
});
