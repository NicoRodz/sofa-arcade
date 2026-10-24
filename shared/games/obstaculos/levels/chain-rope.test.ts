import { describe, expect, it } from 'vitest';
import { playWithBots } from '../campaign/botplay';
import { validateState } from '../validator';
import type { LevelDef } from '../types';
import { LEVEL_01 } from './level01';
import { LEVEL_04 } from './level04';
import { LEVEL_09 } from './level09';

// Levels as they shipped: a 4-tile wall (l01 rows 8-11, l04 rows 8-11, l09 rows 11-14) that only a tower of 2 climbs. In Encadenados with 2 players
// the rope (168 px) cannot hold a climber 192 px above the base, so nobody got past it tied, and the validator said yes. The fixed levels make the
// top row '%' (solid only in Libres): 3 tiles tied, 4 untied.
const solidify = (def: LevelDef, row: number, ranges: [number, number][]): LevelDef => ({
  ...def,
  rows: def.rows.map((r, y) => (y !== row ? r : ranges.reduce((acc, [a, b]) => acc.slice(0, a) + '#'.repeat(b - a) + acc.slice(b), r))),
});
const SHIPPED_L01 = solidify(LEVEL_01, 8, [[50, 54]]);
const SHIPPED_L04 = solidify(LEVEL_04, 8, [[34, 45]]);
const SHIPPED_L09 = solidify(LEVEL_09, 11, [[20, 25], [66, 71]]);

describe('the rope caps a tower tied with 2 players (the shipped l01, l04 and l09 could not be finished tied)', () => {
  for (const [name, shipped, fixed] of [['l01', SHIPPED_L01, LEVEL_01], ['l04', SHIPPED_L04, LEVEL_04], ['l09', SHIPPED_L09, LEVEL_09]] as const) {
    it(`${name}: the shipped version is rejected tied n=2, the fixed one passes tied and untied`, { timeout: 60_000 }, () => {
      expect(validateState(shipped, { n: 2, mode: 'chain', diff: 'hard' }).ok).toBe(false);
      expect(validateState(shipped, { n: 2, mode: 'free', diff: 'hard' }).ok).toBe(true); // untied the tower is fine
      expect(validateState(fixed, { n: 2, mode: 'chain', diff: 'hard' }).ok).toBe(true);
      expect(validateState(fixed, { n: 2, mode: 'free', diff: 'hard' }).ok).toBe(true);
    });
  }
});

describe('level 1 in Encadenados (the bug: it could not be finished tied)', () => {
  it('the shipped 4-tile wall: the real sim agrees with the validator (nobody gets to G tied)', { timeout: 120_000 }, () => {
    expect(playWithBots(SHIPPED_L01, 2, 'chain', 60).world.status).toBe('playing'); // never cleared
  });
  for (const mode of ['chain', 'free'] as const) for (const n of [2, 4]) {
    it(`two or more bots finish the fixed level 1 in the real sim: ${mode}, n=${n}`, { timeout: 120_000 }, () => {
      const s = playWithBots(LEVEL_01, n, mode);
      expect(s.world.status).toBe('cleared');
      expect(s.world.players.every((p) => p.inGoal)).toBe(true);
    });
  }
});
