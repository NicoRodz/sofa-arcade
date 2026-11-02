import { afterEach, describe, expect, it } from 'vitest';
import { formatSeed, mapSeedFor } from '../map';
import { createManchazo } from '../sim';
import { matchRun, nextMapSeed } from '../screen/match/run';
import { resultsHtml, resultsView } from '../screen/match/results';

afterEach(() => {
  matchRun.rounds = 0;
  matchRun.forced = null;
});

describe('the map seed on the TV', () => {
  it('results show it as MAPA <version>·<code>, big, and a round on the F0 map shows none', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 1, mapSeed: 7 * 32 ** 4 + 19 * 32 ** 3 + 23 * 32 ** 2 + 2 * 32 + 20 });
    const v = resultsView(s, []);
    expect(v.mapCode).toBe('MAPA 2·7KQ2M');
    expect(resultsHtml(v, (t) => t)).toContain('MAPA 2·7KQ2M');
    const f0 = resultsView(createManchazo({ slots: [0, 1], teams: [0, 1], seed: 1 }), []);
    expect(f0.mapCode).toBe('');
    expect(resultsHtml(f0, (t) => t)).not.toContain('MAPA');
  });

  it('every round of the lobby takes a new map seed from the substream; the capture tool can force one, once', () => {
    const seen = Array.from({ length: 5 }, () => nextMapSeed(555));
    expect(seen).toEqual([0, 1, 2, 3, 4].map((r) => mapSeedFor(555, r)));
    expect(new Set(seen).size).toBe(5);
    matchRun.forced = 31;
    expect([nextMapSeed(555), nextMapSeed(555)]).toEqual([31, mapSeedFor(555, 6)]);
    expect(formatSeed(31)).toBe('2·0000Z');
  });
});
