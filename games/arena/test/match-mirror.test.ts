import { describe, expect, it } from 'vitest';
import { MAP_W } from '../map';
import { createManchazo, hashManchazo, matchResult } from '../sim';
import { play } from './match-drive';

/** Teams of body i in run A and in run B (labels swapped); B's scripts are A's mirrored left-right: B is A seen in a mirror. */
const CASES: [string, number[]][] = [
  ['4 even', [0, 1, 0, 1]],
  ['3 against 1', [0, 0, 0, 1]],
  ['2 against 3', [0, 1, 0, 1, 1]],
  ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
];

describe('mirror: swapping the teams swaps the result', () => {
  for (const [name, teams] of CASES) {
    it(`${name}: counts, painted tiles, handicap and winner mirror`, () => {
      const slots = teams.map((_t, i) => i);
      const seed = 4; // the round seed picks the side of each team: both runs read it the same way
      for (const rs of [101, 202, 303]) {
        const a = createManchazo({ slots, teams, seed });
        const b = createManchazo({ slots, teams: teams.map((t) => 1 - t), seed });
        expect(a.grid.bodies.map((x) => x.x)).toEqual(b.grid.bodies.map((x) => MAP_W * 16 - x.x));
        play(a, rs, 2400);
        play(b, rs, 2400, true);
        expect(b.match.counts).toEqual([a.match.counts[1], a.match.counts[0]]);
        expect(b.match.reserve).toEqual([a.match.reserve[1], a.match.reserve[0]]);
        expect(b.match.radius).toEqual([a.match.radius[1], a.match.radius[0]]);
        for (let y = 0; y < 15; y++)
          for (let x = 0; x < MAP_W; x++) {
            const pa = a.match.paint[y * MAP_W + x]!;
            expect(b.match.paint[y * MAP_W + (MAP_W - 1 - x)]).toBe(pa < 0 ? pa : 1 - pa);
          }
        const wa = matchResult(a).winner;
        expect(matchResult(b).winner).toBe(wa === null ? null : 1 - wa);
        expect(a.match.counts[0]! + a.match.counts[1]!).toBeGreaterThan(0);
        expect(hashManchazo(a)).not.toBe(hashManchazo(b));
      }
    });
  }
});
