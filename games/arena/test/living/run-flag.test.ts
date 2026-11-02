import { describe, expect, it } from 'vitest';
import { generateMap } from '../../map';
import { ManchazoRun } from '../../screen/match/run';
import { createManchazo } from '../../sim';

// The TV builds its rounds through ManchazoRun: the living flag must be on there, or the whole F5 never reaches a real round.
describe('the real round (ManchazoRun) plays the living map', () => {
  it('a ManchazoRun has the living layer, with the elements its map seed places', () => {
    let withElements = 0;
    for (const mapSeed of [3, 104, 205, 306, 407, 508, 609]) {
      const live = new ManchazoRun([0, 1, 2, 3], [0, 1, 0, 1], 9, mapSeed).state.match.live;
      expect(live).not.toBeNull();
      const want = generateMap(mapSeed, undefined, true).living;
      expect(live!.pairs.length + (live!.fountain ? 1 : 0)).toBe(want.length);
      if (want.length) withElements++;
    }
    expect(withElements).toBeGreaterThan(3);
  });

  it('and it is the round createManchazo builds with living on (same elements), not the F4 one', () => {
    const run = new ManchazoRun([0, 1], [0, 1], 9, 205).state;
    const direct = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 9, mapSeed: 205, sabotage: true, events: true, living: true });
    expect(run.match.live!.pairs.map((p) => p.spec)).toEqual(direct.match.live!.pairs.map((p) => p.spec));
  });
});
