// The scripted team plays the two test maps: 20 seeds x N in {2, 4, 8}. With N = 2 it earns at least one star every time; never a block (no step done by anybody for 30 s);
// the same seed twice gives the same hash (determinism of the new hooks).
import { describe, expect, it } from 'vitest';
import { KNEADER_ROWS } from './map';
import { WOOD_ROWS } from '../woodOven/map';
import { playMech } from './bot';

const SEEDS = Array.from({ length: 20 }, (_v, i) => i + 1);
describe.each([
  ['kneader', KNEADER_ROWS],
  ['woodOven', WOOD_ROWS],
] as const)('bot on the %s map', (id, rows) => {
  for (const n of [2, 4, 8]) {
    it(`N=${n}: 20 seeds, no blocks${n === 2 ? ' and at least one star each' : ''}`, () => {
      const runs = SEEDS.map((seed) => playMech({ rows, mech: { [id]: true }, n, seed }));
      expect(runs.filter((r) => r.blocked).map((r) => r.stuckTicks)).toEqual([]);
      if (n === 2) expect(runs.map((r) => r.stars).filter((s) => s < 1)).toEqual([]);
      expect(runs.every((r) => r.delivered > 0)).toBe(true);
    });
  }
  it('the same seed gives the same final hash', () => {
    const a = playMech({ rows, mech: { [id]: true }, n: 4, seed: 7 });
    const b = playMech({ rows, mech: { [id]: true }, n: 4, seed: 7 });
    expect(a.g.mech!.hash).toBe(b.g.mech!.hash);
    expect(a.score).toBe(b.score);
  });
});
